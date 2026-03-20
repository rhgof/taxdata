# build_data.R
# Reads ATO corporate tax transparency xlsx files, enriches with sector data,
# and outputs test-data.csv for the TaxChart app.
#
# Usage: Rscript R/build_data.R
# Run from the project root directory.
#
# Intermediate files are written to pipeline/ for debugging and resumability.
# To resume from a specific stage, comment out earlier stages and ensure the
# previous stage's intermediate file exists.

library(readxl)
library(readr)
library(dplyr)
library(jsonlite)
library(stringr)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

input_dir <- "Inputs"
output_file <- "test-data.csv"
pipeline_dir <- "pipeline"
date_prefix <- format(Sys.Date(), "%Y%m%d")
pipeline_name <- "ato-tax"

# Create pipeline directory
if (!dir.exists(pipeline_dir)) dir.create(pipeline_dir)

# Helper: name normalisation for matching
normalise_name <- function(x) {
  x <- toupper(x)
  x <- str_replace_all(x, "[^A-Z0-9 ]", "")
  x <- str_replace(x, "\\bLIMITED\\b", "LTD")
  x <- str_squish(x)
  x
}

# Helper: count coercion failures (values that become NA but weren't NA/blank)
count_coercion_failures <- function(original, converted) {
  sum(!is.na(original) & original != "" & is.na(converted))
}

# ---------------------------------------------------------------------------
# Stage 1: Ingest — read all xlsx files and combine
# ---------------------------------------------------------------------------

message("\n=== Stage 1: Ingest ===")

xlsx_files <- list.files(input_dir, pattern = "\\.xlsx$", full.names = TRUE)
message("Found ", length(xlsx_files), " xlsx files")
stopifnot("No xlsx files found" = length(xlsx_files) > 0)

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

  # Some files (e.g. 2013-14) have a title row before the actual headers.
  # Detect by checking if first column name looks like a header ("name") or not.
  orig_names <- colnames(df)
  lower_names <- tolower(orig_names)
  if (length(grep("^name$", lower_names)) == 0 && nrow(df) > 0) {
    # Title row detected — re-read with skip = 1
    df <- read_excel(f, sheet = sheet, skip = 1)
    orig_names <- colnames(df)
    lower_names <- tolower(orig_names)
  }

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

  message("  Columns found: ", paste(orig_names, collapse = ", "))

  # Track raw values for coercion logging
  raw_total_income <- df[[total_income_col[1]]]
  raw_taxable_income <- if (length(taxable_income_col) > 0) df[[taxable_income_col[1]]] else NULL
  raw_tax_payable <- if (length(tax_payable_col) > 0) df[[tax_payable_col[1]]] else NULL

  # Build standardised data frame
  result <- tibble(
    Company = as.character(df[[name_col[1]]]),
    ABN = if (length(abn_col) > 0) as.character(df[[abn_col[1]]]) else NA_character_,
    `Total Income` = as.numeric(raw_total_income),
    `Taxable Income` = if (length(taxable_income_col) > 0) as.numeric(raw_taxable_income) else NA_real_,
    `Tax Payable` = if (length(tax_payable_col) > 0) as.numeric(raw_tax_payable) else NA_real_
  )

  # Log coercion failures
  ti_fail <- count_coercion_failures(raw_total_income, result$`Total Income`)
  if (ti_fail > 0) message("  WARNING: ", ti_fail, " Total Income values failed numeric coercion")
  if (!is.null(raw_taxable_income)) {
    txi_fail <- count_coercion_failures(raw_taxable_income, result$`Taxable Income`)
    if (txi_fail > 0) message("  WARNING: ", txi_fail, " Taxable Income values failed numeric coercion")
  }
  if (!is.null(raw_tax_payable)) {
    tp_fail <- count_coercion_failures(raw_tax_payable, result$`Tax Payable`)
    if (tp_fail > 0) message("  WARNING: ", tp_fail, " Tax Payable values failed numeric coercion")
  }

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
  message("  ", nrow(result), " rows from sheet '", sheet, "'")

  all_data[[length(all_data) + 1]] <- result
}

combined <- bind_rows(all_data)
message("Stage 1 complete: ", nrow(combined), " total rows from ", length(all_data), " files")
stopifnot("Zero rows after ingest" = nrow(combined) > 0)

# Write intermediate
stage1_file <- file.path(pipeline_dir,
  paste0(date_prefix, "-01-", pipeline_name, "-raw-combined.csv"))
write_csv(combined, stage1_file, na = "")
message("Wrote: ", stage1_file)

# ---------------------------------------------------------------------------
# Stage 2: Normalize — cleanse names, assign canonical names per ABN
# ---------------------------------------------------------------------------

message("\n=== Stage 2: Normalize ===")

combined <- combined %>%
  mutate(
    Company = str_replace(Company, "\\bLIMITED\\b", "LTD"),
    Company = str_replace(Company, "\\bLTD\\.\\b", "LTD")
  )
message("Company names cleansed (LIMITED -> LTD, LTD. -> LTD)")

# For each ABN, use the name from the most recent financial year as canonical.
# This handles companies that changed names over time (e.g. CALTEX -> AMPOL).
canonical_names <- combined %>%
  arrange(desc(`Financial Year`)) %>%
  distinct(ABN, .keep_all = TRUE) %>%
  select(ABN, Canonical = Company)

rows_before <- nrow(combined)
combined <- combined %>%
  left_join(canonical_names, by = "ABN") %>%
  mutate(Company = Canonical) %>%
  select(-Canonical)
stopifnot("Row count changed after canonical name join" = nrow(combined) == rows_before)

n_entities <- n_distinct(combined$ABN)
message("Unique entities (by ABN): ", n_entities)
message("Stage 2 complete: ", nrow(combined), " rows")

# Write intermediate
stage2_file <- file.path(pipeline_dir,
  paste0(date_prefix, "-02-", pipeline_name, "-normalized.csv"))
write_csv(combined, stage2_file, na = "")
message("Wrote: ", stage2_file)

# ---------------------------------------------------------------------------
# Stage 3: Enrich — sector classification from ASX + LLM fallback
# ---------------------------------------------------------------------------

message("\n=== Stage 3: Enrich ===")

# 3a. Read ASX listed companies (skip the header description line)
asx <- read_csv(file.path(input_dir, "ASXListedCompanies.csv"), skip = 1,
                show_col_types = FALSE)

asx <- asx %>%
  mutate(
    name_norm = normalise_name(`Company name`),
    asx_code = `ASX code`,
    gics_group = `GICS industry group`
  )

# 3b. Read gics_sector_map.json
gics_map <- fromJSON(file.path(input_dir, "gics_sector_map.json"))

# 3c. Build sector lookup from ASX data
asx_lookup <- asx %>%
  mutate(Sector = gics_map[gics_group]) %>%
  select(name_norm, asx_code, Sector) %>%
  mutate(Sector = as.character(Sector))

# 3d. Read llm_classifications.json for fallback
# Normalise keys to match cleansed company names (LIMITED -> LTD)
llm_sectors_raw <- fromJSON(file.path(input_dir, "llm_classifications.json"))
llm_keys <- names(llm_sectors_raw)
llm_keys <- str_replace(llm_keys, "\\bLIMITED\\b", "LTD")
llm_keys <- str_replace(llm_keys, "\\bLTD\\.\\b", "LTD")
names(llm_sectors_raw) <- llm_keys
llm_sectors <- llm_sectors_raw

# 3e. Match companies to sectors
combined <- combined %>%
  mutate(name_norm = normalise_name(Company))

# Join with ASX data
rows_before <- nrow(combined)
combined <- combined %>%
  left_join(
    asx_lookup %>% distinct(name_norm, .keep_all = TRUE),
    by = "name_norm"
  )
stopifnot("Row count changed after ASX join" = nrow(combined) == rows_before)

# 3f. For unmatched, use llm_classifications — track enrichment source
combined <- combined %>%
  mutate(
    llm_key = toupper(Company),
    llm_key = str_replace(llm_key, "\\bLIMITED\\b", "LTD"),
    llm_key = str_replace(llm_key, "\\bLTD\\.\\b", "LTD"),
    llm_sector = llm_sectors[llm_key],
    llm_sector = as.character(llm_sector),
    Sector_Source = case_when(
      !is.na(Sector) & Sector != "NULL" ~ "ASX",
      !is.na(llm_sector) & llm_sector != "NULL" ~ "LLM",
      TRUE ~ ""
    ),
    Sector = if_else(is.na(Sector) | Sector == "NULL", llm_sector, Sector),
    `ASX Code` = if_else(is.na(asx_code), NA_character_, asx_code),
    `ASX Listed` = !is.na(asx_code)
  )

# Report enrichment coverage by source
total_entities <- n_distinct(combined$Company)
asx_enriched <- combined %>% filter(Sector_Source == "ASX") %>% distinct(Company) %>% nrow()
llm_enriched <- combined %>% filter(Sector_Source == "LLM") %>% distinct(Company) %>% nrow()
unmatched_count <- combined %>%
  filter(Sector_Source == "") %>%
  distinct(Company) %>%
  nrow()
asx_count <- combined %>% filter(`ASX Listed`) %>% distinct(Company) %>% nrow()

message("Enrichment coverage:")
message("  ASX sector:  ", asx_enriched, " entities")
message("  LLM sector:  ", llm_enriched, " entities")
message("  No sector:   ", unmatched_count, " entities")
message("  Total:       ", total_entities, " entities")
message("  ASX-listed:  ", asx_count, " companies")

# Write unmatched entities for review, sorted by latest-year revenue descending
latest_year <- max(combined$`Financial Year`, na.rm = TRUE)
latest_revenue <- combined %>%
  filter(`Financial Year` == latest_year) %>%
  distinct(ABN, .keep_all = TRUE) %>%
  select(ABN, `Total Income`)

unmatched <- combined %>%
  filter(Sector_Source == "") %>%
  distinct(Company, ABN) %>%
  left_join(latest_revenue, by = "ABN") %>%
  arrange(desc(`Total Income`))

unmatched_file <- file.path(pipeline_dir,
  paste0(date_prefix, "-03-", pipeline_name, "-unmatched-sectors.csv"))
write_csv(unmatched, unmatched_file)
message("Wrote ", nrow(unmatched), " unmatched entities to: ", unmatched_file)

message("Stage 3 complete: ", nrow(combined), " rows")

# Write intermediate
stage3_file <- file.path(pipeline_dir,
  paste0(date_prefix, "-03-", pipeline_name, "-enriched.csv"))
write_csv(combined, stage3_file, na = "")
message("Wrote: ", stage3_file)

# ---------------------------------------------------------------------------
# Stage 4: Output — final dataset
# ---------------------------------------------------------------------------

message("\n=== Stage 4: Output ===")

output <- combined %>%
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
    `ASX Listed` = if_else(`ASX Listed`, "TRUE", ""),
    Source
  )

# Sort by Company then Financial Year for readability
output <- output %>%
  arrange(Company, `Financial Year`)

# Diff against previous output if it exists
if (file.exists(output_file)) {
  previous <- read_csv(output_file, show_col_types = FALSE)
  message("Diff against previous output:")
  message("  Previous: ", nrow(previous), " rows, ",
          n_distinct(previous$Company), " entities")
  message("  Current:  ", nrow(output), " rows, ",
          n_distinct(output$Company), " entities")

  prev_companies <- unique(previous$Company)
  curr_companies <- unique(output$Company)
  new_companies <- setdiff(curr_companies, prev_companies)
  removed_companies <- setdiff(prev_companies, curr_companies)
  if (length(new_companies) > 0)
    message("  New entities: ", length(new_companies),
            " (e.g. ", paste(head(new_companies, 5), collapse = ", "), ")")
  if (length(removed_companies) > 0)
    message("  Removed entities: ", length(removed_companies),
            " (e.g. ", paste(head(removed_companies, 5), collapse = ", "), ")")
  if (length(new_companies) == 0 && length(removed_companies) == 0)
    message("  No entity changes")
}

write_csv(output, output_file, na = "")
message("Wrote ", nrow(output), " rows to ", output_file)

# Pipeline copy
stage4_file <- file.path(pipeline_dir,
  paste0(date_prefix, "-04-", pipeline_name, "-final.csv"))
write_csv(output, stage4_file, na = "")
message("Wrote: ", stage4_file)

message("\nDone!")
