# Corporate Tax Data Explorer

An interactive browser-based chart app for exploring Australian corporate tax transparency data.

## Live demo

[**Open the interactive chart**](https://rhgof.github.io/taxdata/)

## Running locally

The app uses `fetch()` to load CSV data, so it must be served over HTTP (not opened directly as a file).

Start a local server from the project directory:

```sh
python3 -m http.server
```

Then open http://localhost:8000 in your browser.

Alternatively, any static file server works — for example:

```sh
# Node.js
npx serve .

# PHP
php -S localhost:8000
```

## Building the data

The R script `R/build_data.R` generates `test-data.csv` from raw ATO data:

```sh
Rscript R/build_data.R
```

**Requirements:** R with packages `readxl`, `readr`, `dplyr`, `jsonlite`, `stringr`.

**Input files** (in `Inputs/`):
- 11 ATO corporate tax transparency xlsx files (2013-14 to 2023-24)
- `ASXListedCompanies.csv` — ASX listed companies with GICS industry groups
- `llm_classifications.json` — manual sector classifications for non-ASX companies
- `gics_sector_map.json` — GICS industry group → sector with ASX index abbreviation

**Pipeline:**
1. Read all xlsx files (handles varying sheet names and column formats across years)
2. Cleanse company names (LIMITED → LTD, LTD. → LTD)
3. Assign canonical company names per ABN (most recent year handles name changes)
4. Enrich with GICS sectors (ASX matching + LLM classifications)
5. Flag ASX-listed companies, add ASX ticker symbol where available
6. Output `test-data.csv` with all entities (~6,025) and source file reference

## Overview

- **Tech:** Plain HTML, CSS, and JavaScript with Plotly.js (loaded via CDN). No build step required.
- **Data:** CSV loaded from the URL specified in the `data-csv-url` attribute on the chart element.
- **Chart modes:** Scatter, Scatter with Trails, Bar, Line.
- **Controls:** Side panel with company/sector selection, year slider, axis pair presets, and sort-by dropdown.
- **Sector legend:** Floating overlay on chart + collapsible panel in side panel, both with checkboxes and color swatches.
- **Dot labels:** Top 5 companies auto-labeled in scatter/trails; click any dot to toggle its label.
