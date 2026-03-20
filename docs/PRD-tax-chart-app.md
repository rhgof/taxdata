# PRD: Australian Corporate Tax Transparency Chart App

## Problem Statement

Australian corporate tax transparency data published annually by the ATO is available as raw spreadsheets spanning 11 years and ~6,025 entities. There is no accessible way to explore, compare, and visualize this data interactively. Journalists, researchers, and citizens who want to understand corporate tax behaviour — such as which companies pay low effective tax rates, how tax payments trend over time, or how sectors compare — must manually wrangle spreadsheets. This makes the data effectively inaccessible to non-technical audiences.

## Solution

A browser-based interactive chart application that visualizes the full ATO corporate tax transparency dataset. The app loads a pre-enriched CSV file and provides five chart modes (Scatter, Scatter with Trails, Bar, Bar over Time, Line) with company and sector views, GICS sector classification, filtering by ASX listing status and company size, and rich tooltips. It is built as a self-contained embeddable widget using plain HTML/CSS/JS with Plotly.js, requiring no build step or framework.

## User Stories

1. As a researcher, I want to view a scatter plot of Total Income vs Tax Payable for ASX-listed companies, so that I can identify outliers with unusually low or high tax payments relative to revenue.
2. As a journalist, I want to switch between Scatter, Trails, Bar, Bar (Time), and Line chart modes, so that I can find the best visualization for a particular story angle.
3. As a citizen, I want to search for a specific company by name, so that I can quickly find and select it for charting.
4. As a researcher, I want to filter companies by sector using a multi-select dropdown, so that I can compare companies within the same industry.
5. As a user, I want to select and deselect individual companies via checkboxes, so that I can build custom comparisons.
6. As a journalist, I want to view scatter trails showing a company's position across all years, so that I can see how its tax behaviour has changed over time.
7. As a user, I want filled circles for the latest year and hollow circles for prior years in trails mode, so that I can distinguish current from historical data points.
8. As a researcher, I want to switch to sector view and see aggregated data, so that I can compare entire industries rather than individual companies.
9. As a user, I want to click on a sector data point and drill down to see all companies in that sector, so that I can investigate which companies drive sector-level trends.
10. As a user, I want a year slider to select which financial year to view in scatter and bar modes, so that I can explore data at different points in time.
11. As a researcher, I want log scale toggles for X and Y axes, so that I can visualize data spanning several orders of magnitude without small companies being invisible.
12. As a user, I want hover tooltips showing company name, sector, country of ultimate owner, and all financial metrics, so that I can get full context without leaving the chart.
13. As a journalist, I want to toggle between ASX-listed companies only (~379) and all ~6,025 entities, so that I can focus on publicly listed companies or explore the broader dataset.
14. As a user, I want a Top N filter (100/200/500/1000/All), so that I can limit the dataset to the largest companies by revenue and avoid visual clutter.
15. As a researcher, I want bar charts sorted descending by value, so that I can quickly identify the largest or smallest companies by a chosen metric.
16. As a user, I want consistent sector colours across all chart modes, so that I can recognise sectors at a glance when switching views.
17. As a user, I want selected companies pinned to the top of the checkbox list when the list rebuilds (on filter/mode changes), but not when clicking individual checkboxes, so that items don't jump away mid-selection.
18. As a user, I want a Select All checkbox that syncs with sector controls, so that I can quickly select or clear all companies.
19. As a researcher, I want derived metrics (Tax Rate, Taxable Income Margin, Tax Revenue Rate) computed automatically, so that I can analyse effective tax rates without manual calculation.
20. As a user, I want the app to fit within 85% viewport height without scrolling, so that it works well embedded in a larger page.
21. As a user, I want the chart axes to remain fixed by default regardless of my selections, so that the scale doesn't jump around when I add or remove companies.
22. As a researcher, I want separate axis ranges for company vs sector views, so that sector aggregates don't inflate the scale when I'm looking at individual companies.
23. As a user, I want an autoscale toggle that fits the axes to the selected data (one tick above the max), so that I can zoom in on a subset of companies without the full dataset's scale dominating.
24. As a user, I want the app to handle missing Taxable Income and Tax Payable gracefully (they're blank under ATO rules), so that companies with null values don't break the chart.
25. As a user, I want source attribution displayed on the chart, so that I know where the data comes from.
26. As a user, I want the app to work on screens as narrow as 600px with controls stacking vertically, so that it's usable on smaller displays.
27. As a data maintainer, I want a reproducible R pipeline (`build_data.R`) that ingests raw ATO xlsx files, cleanses names, matches companies by ABN across years, enriches with GICS sectors, and outputs a single CSV, so that the dataset can be rebuilt when new years are published.
28. As a data maintainer, I want the pipeline to use canonical company names from the most recent year (handling renames like CALTEX to AMPOL), so that company identities are consistent across the time series.
29. As a user, I want line charts showing one line per company/sector over all financial years, so that I can see trends over the full 11-year period.
30. As a user, I want a bar-over-time chart showing grouped bars per year for selected companies/sectors, so that I can compare magnitudes side-by-side across years using bars instead of lines.
31. As a user, I want auto-labels on the top 5 companies by y-value in scatter/trails modes, so that major companies are immediately identifiable.
32. As a user, I want to click any data point to toggle its label on or off, so that I can label specific companies of interest.
33. As a user, I want bar chart labels angled at -45 degrees, so that company names are readable without overlapping.
34. As a user, I want an empty chart with axes shown (no placeholder text) when nothing is selected, so that the interface remains clean.
35. As a user, I want changing ASX or Top N filters to preserve my existing sector and company selections where possible, so that I don't lose my work when adjusting filters.

## Implementation Decisions

- **Tech stack:** Plain HTML, CSS, and JavaScript with Plotly.js 2.x via CDN. No build step, no framework. All styles scoped with `.taxchart-` prefix.
- **Module structure:** Five files — `index.html` (shell), `styles.css` (scoped styles), `data.js` (CSV fetch/parse/derived values/aggregation), `charts.js` (trace builders, layout, formatting), `controls.js` (state management, UI controls, event handlers).
- **State management:** A single global `window.TaxChart.state` object holding all UI state (mode, selections, filters, axis ranges). `controls.js` mutates state and calls `charts.js` to re-render.
- **Data pipeline:** R script (`R/build_data.R`) using readxl, readr, dplyr, jsonlite, stringr. Ingests `Inputs/*.xlsx`, cleanses names (LIMITED to LTD), assigns canonical names per ABN (most recent year), enriches with GICS sectors from `Inputs/ASXListedCompanies.csv` + `Inputs/llm_classifications.json` + `Inputs/gics_sector_map.json`, outputs `ato-tax-transparency.csv`.
- **Data filtering:** Two-stage: first ASX Listed toggle, then Top N by latest-year Total Income. Filter controls are in the side panel alongside sector controls. Filters compose with sector selections. Changing filters recomputes `state.rows` from `state.allRows`.
- **Axis ranges:** Pre-computed on data load, separate for company and sector views, with 5% padding. Prevents axes from jumping as selections change. Autoscale toggle computes range from selected data, rounding max up to the next nice tick (1/2/5 × 10^n).
- **Sector colours:** Fixed 20-colour palette assigned alphabetically once on data load. "Unclassified" gets a dedicated grey (`#999999`) and sorts last. Used consistently across all views and modes.
- **Sector aggregation:** Sum numeric columns per sector per year, recompute derived ratios on sums (not sum of ratios). Companies without a sector classification are grouped under "Unclassified".
- **Null handling:** Missing Taxable Income / Tax Payable parsed as null. Division by zero or null denominator produces null. Null values omitted from chart traces.
- **Chart initialization:** `TaxChart.init(containerSelector)` reads `data-csv-url` attribute, fetches CSV, parses, renders. Embedding is a single `<div>` + `<script>` tag.
- **Bar chart sorting:** Uses `categoryorder: 'trace'` with a sort-by dropdown (default: Total Income descending). Plotly legend disabled; side panel serves as legend.
- **Tooltip formatting:** Currency values formatted as $B/$M/$K. Ratios formatted as percentages. Semi-transparent background (`rgba(255,255,255,0.85)`).

## Testing Decisions

- **No automated test suite.** This is a single-page data visualization app with no build step. Testing is manual: load the app, verify chart modes render correctly, check tooltips, test filter combinations, verify responsive layout.
- **Data pipeline validation:** The R script output can be spot-checked against raw ATO xlsx files for row counts, company name consistency, and sector assignments.
- **Browser testing:** Verify in Chrome and Safari on desktop. Responsive breakpoint at 600px.

## Error Handling

- **CSV fetch fails:** inline error message in chart area ("Unable to load data: [error]")
- **No data-csv-url attribute:** inline error message
- **No selections:** empty chart with axes shown
- **Missing/bad numeric values:** parsed as null, skipped in charts
- **Division by zero:** derived values where denominator is zero or null → null (omitted from chart)

## Out of Scope

- Server-side processing or API — the app is purely client-side
- User authentication or saved state
- Data export (CSV download, image export)
- Accessibility compliance beyond basic keyboard navigation
- Automated testing infrastructure
- Mobile-optimized layout below 600px
- Real-time data updates — dataset is rebuilt manually when new ATO data is published
- Bar chart tooltip cursor tracking (documented as future enhancement)
- Floating sector legend overlay (code preserved but disabled)

## Data Pipeline

The R script `R/build_data.R` transforms raw ATO xlsx files into the enriched CSV (`ato-tax-transparency.csv`) consumed by the app. Run from the project root with `Rscript R/build_data.R`. Requires R packages: readxl, readr, dplyr, jsonlite, stringr.

### Input Files

| File | Purpose |
|------|---------|
| `Inputs/*.xlsx` | Raw ATO corporate tax transparency reports (11 years, 2013-14 to 2023-24) |
| `Inputs/ASXListedCompanies.csv` | ASX-listed companies with GICS industry group classifications |
| `Inputs/gics_sector_map.json` | Maps GICS industry groups to sector names with ASX index codes |
| `Inputs/llm_classifications.json` | Manual/LLM-derived sector classifications for non-ASX companies |

### Pipeline Stages

1. **Ingest** — Reads all xlsx files, handling varying sheet names and column formats. Extracts Company, ABN, Total Income, Taxable Income, Tax Payable, and Financial Year. Logs coercion failures for numeric columns.

2. **Normalize** — Cleanses company names (LIMITED→LTD), assigns canonical names per ABN using the most recent financial year (handles renames like CALTEX→AMPOL). Validates row count is preserved after join.

3. **Enrich** — Matches companies to GICS sectors using two sources with fallback:
   - **ASX** (primary): matches by normalised company name against ASX listed companies file, maps GICS industry group to sector via `gics_sector_map.json`
   - **LLM** (fallback): matches unclassified companies against `llm_classifications.json`
   - Tracks enrichment source per entity (`Sector_Source` column: "ASX", "LLM", or blank)
   - Sets `ASX Listed` flag and `ASX Code` from ASX data
   - Writes unmatched entities to pipeline directory sorted by revenue for review
   - Validates row count is preserved after joins

4. **Output** — Selects final columns, sorts by Company then Financial Year, diffs against previous output (row count, new/removed entities), writes `ato-tax-transparency.csv`.

### Intermediate Files

All intermediate files are written to `pipeline/` (git-ignored) with naming convention:
```
pipeline/YYYYMMDD-NN-ato-tax-{description}.csv
```
This enables debugging and resuming from any stage by commenting out earlier stages.

### Adding New Data

When the ATO publishes a new year:
1. Add the xlsx file to `Inputs/`
2. Run `Rscript R/build_data.R`
3. Review the diff output and unmatched entities file
4. Optionally add sector classifications to `Inputs/llm_classifications.json` for top unmatched companies
5. Re-run and commit the updated `ato-tax-transparency.csv`

### Enrichment Coverage

As of March 2026: 379 entities classified via ASX GICS, 335 via LLM classifications, ~5,310 unclassified (mostly small private entities). Unclassified entities appear as "Unclassified" sector in the app, with a dedicated grey swatch and checkbox in the sector panel.

## Further Notes

- The ATO publishes corporate tax transparency data annually, typically mid-year. The pipeline is designed to accommodate new years by adding xlsx files to `Inputs/` and re-running `build_data.R`.
- Some non-ASX companies outside the original top 200 lack sector assignments. These appear as "Unknown" sector.
- The ASX GICS mapping uses a special case: companies with GICS group "Not Applic" are mapped to Financials, covering Listed Investment Companies and funds.
- Earlier financial years have fewer entities as the ATO reporting threshold captured fewer companies.
- The `Source` column in the CSV preserves the original xlsx filename for data provenance.
