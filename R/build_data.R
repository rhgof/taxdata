# build_data.R
# Reads ATO corporate tax transparency xlsx files, enriches with sector data,
# and outputs test-data.csv for the TaxChart app.
#
# Usage: Rscript R/build_data.R
# Run from the project root directory.

library(readxl)
library(readr)
library(dplyr)
library(jsonlite)
library(stringr)

input_dir <- "Inputs"
output_file <- "test-data.csv"

# ---------------------------------------------------------------------------
# 1. Read all xlsx files and combine
# ---------------------------------------------------------------------------

xlsx_files <- list.files(input_dir, pattern = "\\.xlsx$", full.names = TRUE)
message("Found ", length(xlsx_files), " xlsx files")

all_data <- list()

for (f in xlsx_files) {
  fname <- basename(f)
  message("Reading: ", fname)

  # Determine the correct sheet name
  sheets <- excel_sheets(f)

  if ("Combined" %in% sheets) {
    sheet <- "Combined"
  } else if ("Income tax details" %in% sheets) {
    sheet <- "Income tax details"
  } else if ("Income tax" %in% sheets) {
    sheet <- "Income tax"
  } else {
    # Try matching year pattern like "2014-15"
    year_sheet <- grep("^\\d{4}-\\d{2}$", sheets, value = TRUE)
    if (length(year_sheet) > 0) {
      sheet <- year_sheet[1]
    } else {
      warning("No known sheet found in ", fname, ". Sheets: ", paste(sheets, collapse = ", "))
      next
    }
  }

  df <- read_excel(f, sheet = sheet)

  # Normalise column names: lowercase for matching
  orig_names <- colnames(df)
  lower_names <- tolower(orig_names)

  # Find columns by pattern (case-insensitive)
  name_col <- orig_names[grep("^name$", lower_names)]
  abn_col <- orig_names[grep("^abn$", lower_names)]
  total_income_col <- orig_names[grep("^total income", lower_names)]
  taxable_income_col <- orig_names[grep("^taxable income", lower_names)]
  tax_payable_col <- orig_names[grep("^tax payable", lower_names)]
  income_year_col <- orig_names[grep("^income year$", lower_names)]

  if (length(name_col) == 0 || length(total_income_col) == 0) {
    warning("Missing required columns in ", fname)
    next
  }

  # Build standardised data frame
  result <- tibble(
    Company = as.character(df[[name_col[1]]]),
    ABN = if (length(abn_col) > 0) as.character(df[[abn_col[1]]]) else NA_character_,
    `Total Income` = as.numeric(df[[total_income_col[1]]]),
    `Taxable Income` = if (length(taxable_income_col) > 0) as.numeric(df[[taxable_income_col[1]]]) else NA_real_,
    `Tax Payable` = if (length(tax_payable_col) > 0) as.numeric(df[[tax_payable_col[1]]]) else NA_real_
  )

  # Financial Year: from column if present, otherwise from filename
  if (length(income_year_col) > 0) {
    result$`Financial Year` <- as.character(df[[income_year_col[1]]])
  } else {
    # Extract YYYY-YY from filename
    year_match <- str_extract(fname, "\\d{4}-\\d{2}")
    if (is.na(year_match)) {
      warning("Cannot determine financial year from ", fname)
      next
    }
    result$`Financial Year` <- year_match
  }

  result$Source <- fname

  all_data[[length(all_data) + 1]] <- result
}

combined <- bind_rows(all_data)
message("Total rows across all years: ", nrow(combined))

# ---------------------------------------------------------------------------
# 2. Select top 200 companies by 2023-24 Total Income
# ---------------------------------------------------------------------------

top200 <- combined %>%
  filter(`Financial Year` == "2023-24") %>%
  arrange(desc(`Total Income`)) %>%
  slice_head(n = 200) %>%
  select(Company, ABN)

message("Top 200 companies identified from 2023-24 data")

# ---------------------------------------------------------------------------
# 3. Match top 200 across all years by Company + ABN
# ---------------------------------------------------------------------------

filtered <- combined %>%
  inner_join(top200, by = c("Company", "ABN"))

message("Rows after filtering to top 200 across all years: ", nrow(filtered))

# ---------------------------------------------------------------------------
# 4. Sector enrichment
# ---------------------------------------------------------------------------

# 4a. Read ASX listed companies (skip the header description line)
asx <- read_csv(file.path(input_dir, "ASXListedCompanies.csv"), skip = 1,
                show_col_types = FALSE)

# Normalise ASX company names for matching
normalise_name <- function(x) {
  x <- toupper(x)
  x <- str_replace_all(x, "[^A-Z0-9 ]", "")
  x <- str_squish(x)
  x
}

asx <- asx %>%
  mutate(
    name_norm = normalise_name(`Company name`),
    asx_code = `ASX code`,
    gics_group = `GICS industry group`
  )

# 4b. Read gics_sector_map.json
gics_map <- fromJSON(file.path(input_dir, "gics_sector_map.json"))

# 4c. Build sector lookup from ASX data
asx_lookup <- asx %>%
  mutate(Sector = gics_map[gics_group]) %>%
  select(name_norm, asx_code, Sector) %>%
  # Sector is a list column from the map lookup; unlist it

  mutate(Sector = as.character(Sector))

# 4d. Read llm_classifications.json for fallback
llm_sectors <- fromJSON(file.path(input_dir, "llm_classifications.json"))

# 4e. Match companies to sectors
filtered <- filtered %>%
  mutate(name_norm = normalise_name(Company))

# Join with ASX data
filtered <- filtered %>%
  left_join(
    asx_lookup %>% distinct(name_norm, .keep_all = TRUE),
    by = "name_norm"
  )

# 4f. For unmatched, use llm_classifications
# llm_sectors keys are uppercase company names
filtered <- filtered %>%
  mutate(
    llm_key = toupper(Company),
    llm_sector = llm_sectors[llm_key],
    llm_sector = as.character(llm_sector),
    Sector = if_else(is.na(Sector) | Sector == "NULL", llm_sector, Sector),
    `ASX Code` = if_else(is.na(asx_code), NA_character_, asx_code)
  )

# Report unmatched
unmatched <- filtered %>%
  filter(is.na(Sector) | Sector == "NULL") %>%
  distinct(Company)

if (nrow(unmatched) > 0) {
  message("WARNING: ", nrow(unmatched), " companies still unmatched:")
  message(paste("  -", unmatched$Company, collapse = "\n"))
}

matched_count <- filtered %>%
  filter(!is.na(Sector) & Sector != "NULL") %>%
  distinct(Company) %>%
  nrow()
message("Companies with sector assignment: ", matched_count, " / 200")

# ---------------------------------------------------------------------------
# 5. Final output
# ---------------------------------------------------------------------------

output <- filtered %>%
  transmute(
    Company,
    ABN,
    `Country of Ultimate Owner` = "",
    Sector = if_else(is.na(Sector) | Sector == "NULL", "", Sector),
    `Total Income` = `Total Income`,
    `Taxable Income` = `Taxable Income`,
    `Tax Payable` = `Tax Payable`,
    `Financial Year` = `Financial Year`,
    `ASX Code` = if_else(is.na(`ASX Code`), "", `ASX Code`),
    Source
  )

# Sort by Company then Financial Year for readability
output <- output %>%
  arrange(Company, `Financial Year`)

write_csv(output, output_file, na = "")
message("Wrote ", nrow(output), " rows to ", output_file)
message("Done!")
