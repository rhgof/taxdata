# Batch UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add floating sector legend overlay, collapsible sector panel in sidebar, vertical bar labels, scatter/trails dot labels, and an R data build script — all wired cleanly so either legend option can be removed later.

**Architecture:** Both sector legend UIs (floating overlay + collapsible panel) call the same state functions (`toggleSector`, `selectAllSectors`, `clearAllSectors`) and a new `TaxChart.syncSectorUI()` function that updates all sector UIs in one call. The R script reads raw xlsx + enrichment files and outputs the same CSV the app already consumes. Dot labels use Plotly `text` + `textposition` with a `pinnedLabels` state set.

**Tech Stack:** Plain JS/CSS (no framework), Plotly.js 2.x, R with readxl/readr/dplyr/jsonlite/stringr

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `controls.js` | Modify | Add floating legend builder, collapsible sector panel, `syncSectorUI()` |
| `charts.js` | Modify | Bar tickangle/font, scatter/trails text labels, click-to-pin handler |
| `styles.css` | Modify | Floating legend styles, collapsible panel styles |
| `data.js` | No change | — |
| `index.html` | No change | — |
| `Inputs/gics_sector_map.json` | Create | GICS industry group → sector mapping (read by R script) |
| `R/build_data.R` | Create | Full data pipeline: xlsx → enrich → CSV |
| `CLAUDE.md` | Modify | Document new features, R script |
| `README.md` | Modify | Add R build instructions |

---

### Task 1: Sync function for sector UIs

Both legend options (floating + collapsible) need to stay in sync. Extract a single update function before building either UI.

**Files:**
- Modify: `controls.js`

- [ ] **Step 1: Add `syncSectorUI()` function**

Add after `clearAllSectors()` at end of controls.js:

```js
// Update all sector UI elements (floating legend, collapsible panel, dropdown).
// Called after any sector selection change to keep all UIs in sync.
TaxChart.syncSectorUI = function() {
  if (TaxChart._updateSectorDropdown) TaxChart._updateSectorDropdown();
  if (TaxChart._updateFloatingLegend) TaxChart._updateFloatingLegend();
  if (TaxChart._updateCollapsiblePanel) TaxChart._updateCollapsiblePanel();
};
```

- [ ] **Step 2: Replace existing `_updateSectorDropdown` calls with `syncSectorUI`**

In `buildSidePanel()`, replace the two places that call `TaxChart._updateSectorDropdown()` with `TaxChart.syncSectorUI()`:
- In the Select All checkbox `change` handler
- Anywhere else `_updateSectorDropdown` is called directly

- [ ] **Step 3: Verify no regressions**

Open app locally, toggle sectors via dropdown, verify chart updates correctly.

- [ ] **Step 4: Commit**

```bash
git add controls.js
git commit -m "refactor: add syncSectorUI to coordinate sector UI updates"
```

---

### Task 2: Floating sector legend overlay on chart

**Files:**
- Modify: `controls.js` (add `buildFloatingLegend()`)
- Modify: `styles.css` (add `.taxchart-legend-*` classes)

- [ ] **Step 1: Add CSS for floating legend**

Add to styles.css before the mobile media query:

```css
/* ── Floating sector legend overlay ── */
.taxchart-legend {
  position: absolute;
  top: 40px;
  left: 10px;
  z-index: 50;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
  max-height: 280px;
  overflow-y: auto;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.taxchart-legend-toggle {
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 4px;
  user-select: none;
}

.taxchart-legend-btnrow {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.taxchart-legend-btnrow button {
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 2px;
  cursor: pointer;
}

.taxchart-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
  cursor: pointer;
  white-space: nowrap;
}

.taxchart-legend-item:hover {
  background: #f0f0f0;
}
```

- [ ] **Step 2: Add `buildFloatingLegend()` in controls.js**

Add after `syncSectorUI()`. Builds an absolutely-positioned legend inside the chart area container. Includes collapse toggle, Check all/Clear all buttons, and sector checkboxes with swatches. Stores `TaxChart._updateFloatingLegend` for sync.

- [ ] **Step 3: Call `buildFloatingLegend()` from `renderApp()`**

In `renderApp()`, after `TaxChart.buildSidePanel()` and before `TaxChart.updateChart()`.

- [ ] **Step 4: Verify**

Open app, confirm floating legend appears top-left of chart. Toggle sectors, verify chart and side panel sync. Collapse/expand the legend.

- [ ] **Step 5: Commit**

```bash
git add controls.js styles.css
git commit -m "feat: add floating sector legend overlay on chart area"
```

---

### Task 3: Collapsible sector section in side panel

Replace the current dropdown with an always-visible collapsible section above the company list.

**Files:**
- Modify: `controls.js` (replace dropdown section in `buildSidePanel()`)
- Modify: `styles.css` (add `.taxchart-sector-panel-*` classes)

- [ ] **Step 1: Add CSS for collapsible sector panel**

Add to styles.css before the mobile media query:

```css
/* ── Collapsible sector panel in side panel ── */
.taxchart-sector-panel {
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  margin-bottom: 10px;
}

.taxchart-sector-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  background: #f9f9f9;
  user-select: none;
  font-weight: 600;
  font-size: 13px;
}

.taxchart-sector-panel-header:hover {
  background: #f0f0f0;
}

.taxchart-sector-panel-body {
  padding: 4px;
  max-height: 150px;
  overflow-y: auto;
  border-top: 1px solid #e0e0e0;
}

.taxchart-sector-panel-btnrow {
  display: flex;
  gap: 6px;
  padding: 4px 8px;
  border-top: 1px solid #e0e0e0;
}
```

- [ ] **Step 2: Replace dropdown with collapsible panel in `buildSidePanel()`**

Replace the `if (TaxChart.state.viewBy === 'companies')` block that builds the filter row and dropdown. New panel has:
- Header: "▼ Sectors (N/M)" — click to toggle body
- Body: sector checkboxes with swatches (reuse `taxchart-sector-dropdown-item` style)
- Footer: Check all / Clear all buttons
- Stores `TaxChart._updateCollapsiblePanel` for sync

- [ ] **Step 3: Verify**

Open app, confirm collapsible panel shows above company list. Toggle sectors, collapse/expand, verify sync with floating legend and chart.

- [ ] **Step 4: Commit**

```bash
git add controls.js styles.css
git commit -m "feat: add collapsible sector panel in side panel"
```

---

### Task 4: Bar chart vertical labels with smaller font

**Files:**
- Modify: `charts.js` (layout builder)

- [ ] **Step 1: Update bar layout in `buildLayout()`**

Change bar x-axis from `tickangle: -45` to `tickangle: -90, tickfont: { size: 10 }`.

- [ ] **Step 2: Verify**

Open app in bar mode, confirm labels are vertical and fit within chart area.

- [ ] **Step 3: Commit**

```bash
git add charts.js
git commit -m "fix: bar chart labels vertical with smaller font to prevent overflow"
```

---

### Task 5: Scatter/trails dot labels (top 5 + click to toggle)

**Files:**
- Modify: `controls.js` (add `pinnedLabels` to state)
- Modify: `charts.js` (add text to traces, add click handler)

- [ ] **Step 1: Add `pinnedLabels` to state**

In `TaxChart.state`, add `pinnedLabels: {}` — object of `{ companyName: true }` for manually pinned labels.

- [ ] **Step 2: Add label logic to `buildScatterTraces()`**

After collecting all points, determine top 5 by y-value. For each trace, set `mode: 'markers+text'` and add `text` with the company name if it's top-5 or pinned, empty string otherwise. Use `textposition: 'top center'` and `textfont: { size: 10 }`.

- [ ] **Step 3: Add label logic to `buildTrailsTraces()`**

Similar to scatter but only label the latest-year point for each company.

- [ ] **Step 4: Add click-to-pin handler in `updateChart()`**

After `Plotly.newPlot()`, for scatter and trails modes in company view, attach `plotly_click` handler that toggles `pinnedLabels[name]` and calls `updateChart()`. Must not interfere with sector drill-down (check `viewBy !== 'sectors'`).

- [ ] **Step 5: Verify**

Open scatter mode, confirm top 5 by y-value have labels. Click a dot to pin/unpin. Switch to trails, verify labels on latest-year dots only.

- [ ] **Step 6: Commit**

```bash
git add controls.js charts.js
git commit -m "feat: auto-label top 5 dots in scatter/trails, click to toggle labels"
```

---

### Task 6: R data build script

**Files:**
- Create: `Inputs/gics_sector_map.json`
- Create: `R/build_data.R`
- Modify: `charts.js` (show ASX code in tooltip)

**Important xlsx format variations:**

| Years | Sheet name | Has Income year column | Notes |
|-------|-----------|----------------------|-------|
| 2013-14 | `Combined` | No | Also has `December` and `March` sheets |
| 2014-15 | `2014-15` | No | Also has prior year sheet |
| 2015-16 | `2015-16` | No | Also has prior year sheets |
| 2016-17+ | `Income tax details` or `Income tax` | Yes | Standard format |

Column headers vary in capitalisation: `Total Income $` vs `Total income $`, etc.

- [ ] **Step 1: Create `Inputs/gics_sector_map.json`**

Extract the GICS industry group → sector mapping into a standalone JSON file:

```json
{
  "Automobiles & Components": "Consumer Discretionary (XDJ)",
  "Banks": "Financials (XFJ)",
  "Capital Goods": "Industrials (XNJ)",
  "Commercial & Professional Services": "Industrials (XNJ)",
  "Consumer Discretionary Distribution & Retail": "Consumer Discretionary (XDJ)",
  "Consumer Durables & Apparel": "Consumer Discretionary (XDJ)",
  "Consumer Services": "Consumer Discretionary (XDJ)",
  "Consumer Staples Distribution & Retail": "Consumer Staples (XSJ)",
  "Diversified Financials": "Financials (XFJ)",
  "Energy": "Energy (XEJ)",
  "Financial Services": "Financials (XFJ)",
  "Food Beverage & Tobacco": "Consumer Staples (XSJ)",
  "Food, Beverage & Tobacco": "Consumer Staples (XSJ)",
  "Health Care Equipment & Services": "Health Care (XHJ)",
  "Household & Personal Products": "Consumer Staples (XSJ)",
  "Insurance": "Financials (XFJ)",
  "Materials": "Materials (XMJ)",
  "Media & Entertainment": "Communication Services (XTJ)",
  "Pharmaceuticals Biotechnology & Life Sciences": "Health Care (XHJ)",
  "Pharmaceuticals, Biotechnology & Life Sciences": "Health Care (XHJ)",
  "Real Estate": "Real Estate (XPJ)",
  "Real Estate Management & Development": "Real Estate (XPJ)",
  "REITs": "Real Estate (XPJ)",
  "Retailing": "Consumer Discretionary (XDJ)",
  "Semiconductors & Semiconductor Equipment": "Information Technology (XIJ)",
  "Software & Services": "Information Technology (XIJ)",
  "Technology Hardware & Equipment": "Information Technology (XIJ)",
  "Telecommunication Services": "Communication Services (XTJ)",
  "Transportation": "Industrials (XNJ)",
  "Utilities": "Utilities (XUJ)"
}
```

- [ ] **Step 2: Create `R/build_data.R`**

R script that:
1. Reads all 11 xlsx files, handling varying sheet names and column formats
2. Derives financial year from filename for files that lack the column (2013-16)
3. Selects top 200 companies by 2023-24 total income
4. Matches those companies across all years by name + ABN
5. Enriches with GICS sectors: reads `Inputs/gics_sector_map.json` for the industry→sector mapping, `ASXListedCompanies.csv` for ASX code + industry group, `llm_classifications.json` for non-ASX companies
6. Adds ASX ticker symbol (blank if not listed) and source filename columns
7. Outputs `test-data.csv`

Dependencies: `readxl`, `readr`, `dplyr`, `jsonlite`, `stringr`

- [ ] **Step 3: Verify R script runs**

```bash
Rscript R/build_data.R
```

Check: correct columns (Company, ABN, Country of Ultimate Owner, Sector, Total Income, Taxable Income, Tax Payable, Financial Year, ASX Code, Source), ~1914 rows, sectors match current data.

- [ ] **Step 4: Update tooltip to show ASX code**

In `charts.js` `buildFullTooltip()`, add ASX code line after company name if present:

```js
if (row['ASX Code']) {
  parts.push('ASX: ' + row['ASX Code']);
}
```

- [ ] **Step 5: Commit**

```bash
git add Inputs/gics_sector_map.json R/build_data.R charts.js
git commit -m "feat: add R data build script with GICS map, ASX ticker, and source columns"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Add to the project description:
- `Inputs/gics_sector_map.json` — GICS industry group → sector mapping
- `R/build_data.R` — data build pipeline
- New CSV columns: ASX Code, Source
- Floating sector legend overlay
- Collapsible sector panel in side panel
- Dot labels in scatter/trails (top 5 + click to pin)
- Bar chart vertical labels

- [ ] **Step 2: Update README.md**

Add a "Building the data" section:

```markdown
## Building the data

The R script `R/build_data.R` generates `test-data.csv` from raw ATO data:

\```sh
Rscript R/build_data.R
\```

**Requirements:** R with packages `readxl`, `readr`, `dplyr`, `jsonlite`, `stringr`.

**Input files** (in `Inputs/`):
- 11 ATO corporate tax transparency xlsx files (2013-14 to 2023-24)
- `ASXListedCompanies.csv` — ASX listed companies with GICS industry groups
- `llm_classifications.json` — manual sector classifications for non-ASX companies
- `gics_sector_map.json` — GICS industry group → sector with ASX index abbreviation

**Pipeline:**
1. Read all xlsx files (handles varying sheet names and column formats across years)
2. Select top 200 companies by 2023-24 total income
3. Match across all 11 years by company name + ABN
4. Enrich with GICS sectors (ASX matching + LLM classifications)
5. Add ASX ticker symbol where available
6. Output `test-data.csv` with source file reference
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README with new features and R build script"
```

---

## Execution Order

Tasks 1–3 are sequential (sync function → floating legend → collapsible panel).
Tasks 4–6 are independent of each other and of tasks 1–3.
Task 7 depends on all others completing.

Recommended parallel groups:
- **Group A:** Tasks 1 → 2 → 3 (sector UIs)
- **Group B:** Task 4 (bar labels) — independent
- **Group C:** Task 5 (dot labels) — independent
- **Group D:** Task 6 (R script) — independent
- **Final:** Task 7 (docs) — after all above
