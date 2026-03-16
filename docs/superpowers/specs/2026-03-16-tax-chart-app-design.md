# Tax Data Chart App — Design Spec

## Overview

A browser-based interactive chart app that visualizes Australian corporate tax transparency data. The app plots multiple data series across four chart modes, with filtering by company and sector. It is embedded as a section within a broader web page.

## Data

### Source
- CSV file loaded via `fetch()` at runtime. The URL is specified via a `data-csv-url` attribute on the container `<div>` element
- First row is a header
- The CSV is assumed to be pre-enriched with Sector and Country of Ultimate Owner columns; the app does not perform data enrichment

### Columns
| Column | Type | Notes |
|--------|------|-------|
| Company | string | Entity name |
| Country of Ultimate Owner | string | Tooltip-only for now |
| Sector | string | Used for grouping, filtering, coloring |
| Total Income | number | Revenue; may be referred to as "Revenue" in UI |
| Taxable Income | number | May be null/blank (ATO rules: not reported when zero or negative) |
| Tax Payable | number | May be null/blank (same rules) |
| Financial Year | string | e.g. "2022-23" |

### Derived Values
Computed after parsing, not stored in CSV:
- **Tax Rate** = Tax Payable / Taxable Income (null when Taxable Income is zero or null)
- Additional derived values may be added later

### Sector Aggregation
When viewing by sector:
- Numeric columns are summed across all companies in the sector for each financial year
- Derived values are recomputed on aggregated totals (not summed from individual rows)

## Chart Modes

### 1. Scatter
- X and Y axes chosen from pre-defined axis pairs
- One point per selected company/sector for the selected financial year
- Year selected via slider

### 2. Scatter with Trails
- Same axis pair selection as scatter
- All available financial years plotted per company/sector
- Points connected chronologically with lines (`mode: 'lines+markers'`)
- Year slider hidden

### 3. Bar Chart
- X-axis: companies or sectors
- Y-axis: a chosen metric (single dropdown, not a pair)
- Year selected via slider (which year's data to show)
- When viewing sectors, each bar shows the aggregated (summed) value for that sector in the selected financial year
- Option to sort bars descending by value

### 4. Line Chart
- X-axis: Financial Year
- Y-axis: a chosen metric (single dropdown)
- One line per selected company/sector
- Year slider hidden

## Axis Pair Configuration

Defined in a config array, easily extensible:

```js
const AXIS_PAIRS = [
  { label: "Revenue vs Tax Payable", x: "Total Income", y: "Tax Payable" },
  { label: "Revenue vs Taxable Income", x: "Total Income", y: "Taxable Income" },
  { label: "Taxable Income vs Tax Payable", x: "Taxable Income", y: "Tax Payable" },
  { label: "Taxable Income vs Tax Rate", x: "Taxable Income", y: "Tax Rate" },
];
```

Exact list to be refined.

For bar and line modes, the axis pair dropdown switches to a single metric dropdown:

```js
const SINGLE_METRICS = [
  { label: "Total Income (Revenue)", field: "Total Income" },
  { label: "Taxable Income", field: "Taxable Income" },
  { label: "Tax Payable", field: "Tax Payable" },
  { label: "Tax Rate", field: "Tax Rate" },
];
```

## UI Layout

### Top Controls Bar (left to right)
- **Chart mode selector:** radio buttons or segmented toggle — Scatter | Trails | Bar | Line
- **Axis pair dropdown:** populated from config. In bar/line modes, switches to a single metric dropdown
- **Year slider:** range input spanning min–max years in the data. Visible in scatter and bar modes, hidden in trails and line modes

### Chart Area
- Plotly.js chart, responsive width within the container

### Bottom/Side Panel
- **View toggle:** "Companies" or "Sectors" — switches the search list and data grouping
- **Search input:** filters the checkbox list as user types
- **Checkbox list:** scrollable list of filtered companies/sectors with checkboxes
- **Clear button:** deselects all
- **Sector highlight:** when viewing companies, a dropdown or clickable legend to highlight one sector (all other sectors fade to grey, opacity ~0.15)
- **Sort descending toggle:** checkbox, visible only in bar chart mode

## Interaction Flow

1. Page loads -> fetch CSV -> parse -> compute derived values -> populate controls (year range, company/sector lists, axis pairs)
2. Default state: scatter mode, first axis pair, latest year, no selections (empty chart with prompt "Select companies or sectors to begin")
3. User picks chart mode -> controls adapt (show/hide year slider, switch axis pair dropdown to single metric for bar/line)
4. User searches and selects companies/sectors -> chart renders
5. Changing axis pair, year, or mode re-renders with current selections preserved where possible

## Sector Features

### Consistent Colors
- A fixed color map is built once on data load: sectors assigned colors from a palette in alphabetical order
- Same colors used across all chart modes and views

### Sector Filtering
- When viewing companies, user can filter the company list by sector

### Sector Highlighting
- Selecting a sector for highlighting sets all other sectors' traces to `opacity: 0.15`
- Uses Plotly `restyle` for efficient update without full redraw

### Sector Drill-Down
- When viewing aggregated sector data, clicking a sector data point switches to company view, pre-filtered to that sector's companies

## Plotly Trace Mapping

- Each selected company (or sector) becomes one Plotly trace
- Trace color determined by sector color map
- Hover tooltips show: company name, sector, country of ultimate owner, x value, y value (and year where relevant)

## Error Handling

- **CSV fetch fails:** inline error message in chart area ("Unable to load data")
- **No selections:** empty chart with prompt ("Select companies or sectors to begin")
- **Missing/bad numeric values:** skip rows with non-numeric values in numeric columns; don't break the chart
- **Division by zero:** derived values where denominator is zero or null -> null (omitted from chart)
- **No data for selected year:** empty chart with message ("No data for [year]")

## Tech Stack

- Plain HTML, CSS, JavaScript — no build step, no framework
- Plotly.js loaded via CDN
- All styles scoped with `.taxchart-` prefix to avoid leaking into host page
- Self-contained within a `<div>` for embedding
- Minimum supported width: 600px. Controls stack vertically on narrower screens

## File Structure

| File | Responsibility |
|------|---------------|
| `index.html` | HTML structure, CDN link for Plotly, script tags |
| `styles.css` | Scoped styles (`.taxchart-` prefix) |
| `data.js` | Fetch CSV, parse, compute derived values, sector aggregation. Exposes `TaxChart.loadData(url)` |
| `charts.js` | Render/update Plotly chart based on current state. Handles all four chart modes, trace creation, sector highlighting |
| `controls.js` | UI event handlers, search/filter logic, app state management, triggers chart updates |

### Shared State

A global object `window.TaxChart.state` holding:
- `mode` — current chart mode
- `axisPair` — selected axis pair (or single metric for bar/line)
- `year` — selected financial year
- `viewBy` — "companies" or "sectors"
- `selected` — set of selected company/sector names
- `highlightSector` — sector to highlight (or null)
- `sortDescending` — boolean for bar chart sorting

`controls.js` mutates state and calls `charts.js` to re-render.

### Initialization

The app is initialized by calling `TaxChart.init(containerSelector)`, which reads the `data-csv-url` attribute from the container element, fetches and parses the data, and renders the controls and chart.

```html
<div id="tax-chart" class="taxchart" data-csv-url="data/tax-data.csv"></div>
<script>TaxChart.init('#tax-chart');</script>
```

## Test Data

`test-data.csv` contains 100 companies across 16 sectors over 3 financial years (2020-21 through 2022-23), using real company names from the ATO dataset with fictional sector and country values. Includes rows with blank Taxable Income and Tax Payable to test null handling.
