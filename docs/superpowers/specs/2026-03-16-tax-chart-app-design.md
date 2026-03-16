# Tax Data Chart App — Design Spec

## Overview

A browser-based interactive chart app that visualizes Australian corporate tax transparency data. The app plots multiple data series across four chart modes, with filtering by company and sector. It is embedded as a section within a broader web page and fits within a single viewport (no scrolling).

## Data

### Source
- CSV file loaded via `fetch()` at runtime. The URL is specified via a `data-csv-url` attribute on the container `<div>` element
- First row is a header
- The CSV is assumed to be pre-enriched with Sector and Country of Ultimate Owner columns; the app does not perform data enrichment

### Columns
| Column | Type | Notes |
|--------|------|-------|
| Company | string | Entity name |
| Country of Ultimate Owner | string | Shown in hover tooltips |
| Sector | string | Used for grouping, filtering, coloring |
| Total Income | number | Revenue; displayed as "Revenue" in dropdown labels |
| Taxable Income | number | May be null/blank (ATO rules: not reported when zero or negative) |
| Tax Payable | number | May be null/blank (same rules) |
| Financial Year | string | e.g. "2022-23" |

### Display Labels
Field names in axis labels use a display-name map (`FIELD_LABELS`) so dropdown labels and axis titles are consistent:

```js
TaxChart.FIELD_LABELS = {
  'Total Income': 'Revenue',
  'Taxable Income': 'Taxable Income',
  'Tax Payable': 'Tax Payable',
  'Tax Rate': 'Tax Rate'
};
```

### Derived Values
Computed after parsing, not stored in CSV:
- **Tax Rate** = Tax Payable / Taxable Income (null when Taxable Income is zero or null)
- Tax Rate is displayed as a percentage throughout the app (tooltips, axis labels, tick marks)
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
- X-axis: companies or sectors (labels angled -45° to avoid truncation, with 150px bottom margin)
- Y-axis: a chosen metric (single dropdown, not a pair)
- Year selected via slider (which year's data to show)
- When viewing sectors, each bar shows the aggregated (summed) value for that sector in the selected financial year
- Option to sort bars descending by value
- Bar labels shown only on x-axis (no labels on bars themselves)
- Category order follows trace order (`categoryorder: 'trace'`) to respect sort

### 4. Line Chart
- X-axis: Financial Year
- Y-axis: a chosen metric (single dropdown)
- One line per selected company/sector
- Year slider hidden

## Axis Pair Configuration

Defined in a config array, easily extensible:

```js
TaxChart.AXIS_PAIRS = [
  { label: 'Revenue vs Tax Payable', x: 'Total Income', y: 'Tax Payable' },
  { label: 'Revenue vs Taxable Income', x: 'Total Income', y: 'Taxable Income' },
  { label: 'Taxable Income vs Tax Payable', x: 'Taxable Income', y: 'Tax Payable' },
  { label: 'Taxable Income vs Tax Rate', x: 'Taxable Income', y: 'Tax Rate' }
];
```

For bar and line modes, the axis pair dropdown switches to a single metric dropdown:

```js
TaxChart.SINGLE_METRICS = [
  { label: 'Total Income (Revenue)', field: 'Total Income' },
  { label: 'Taxable Income', field: 'Taxable Income' },
  { label: 'Tax Payable', field: 'Tax Payable' },
  { label: 'Tax Rate', field: 'Tax Rate' }
];
```

## UI Layout

The app fills the viewport height (`100vh`) with a flex column layout, no scrolling on the page itself.

### Top Controls Bar (left to right, wraps on narrow screens)
- **Chart mode selector:** buttons — Scatter | Trails | Bar | Line (active state highlighted)
- **Axis pair dropdown:** populated from config. In bar/line modes, switches to a single metric dropdown
- **Year slider:** range input spanning min–max years in the data. Visible in scatter and bar modes, hidden in trails and line modes. Label shows current year.
- **Sort descending checkbox:** visible only in bar chart mode

### Main Area (flex row)

#### Chart Area (left, flex: 1)
- Plotly.js chart, responsive width within the container
- Plotly legend disabled — the side panel checkbox list serves as the legend

#### Side Panel (right, 280px fixed width)
- **View toggle:** "Companies" or "Sectors" buttons — switches the list and data grouping
- **Sector dropdown** (companies view only): single dropdown that both filters the company list to a sector AND highlights that sector on the chart (other sectors fade to opacity 0.15). Selecting "All sectors" clears both filter and highlight.
- **Search input:** filters the checkbox list as user types
- **Select all / Clear all buttons:** select all currently visible (filtered) items, or clear all selections
- **Checkbox list:** scrollable list filling remaining height, with color swatches matching sector colors. Selected items are pinned to the top of the list.

### Responsive (< 600px)
- Top bar stacks vertically
- Main area stacks vertically (chart above, side panel below full width)
- Side panel border switches from left to top
- Year slider stretches to full width

## Interaction Flow

1. Page loads → fetch CSV → parse → compute derived values → populate controls (year range, company/sector lists, axis pairs)
2. Default state: scatter mode, first axis pair, latest year, no selections (empty chart with prompt "Select companies or sectors to begin")
3. User picks chart mode → controls adapt (show/hide year slider, switch axis pair dropdown to single metric for bar/line)
4. User searches and selects companies/sectors → chart renders
5. Changing axis pair, year, or mode re-renders with current selections preserved where possible

## Sector Features

### Consistent Colors
- A fixed color map is built once on data load: sectors assigned colors from a 20-color palette in alphabetical order
- Same colors used across all chart modes and views
- Color swatches appear next to items in the checkbox list

### Combined Sector Filter & Highlight
- When viewing companies, a single "Sector:" dropdown both filters the company list and highlights that sector on the chart
- Highlighting sets all non-matching sectors' traces to `opacity: 0.15`
- Uses `Plotly.restyle` for efficient update without full redraw

### Sector Drill-Down
- When viewing aggregated sector data in scatter or bar mode, clicking a sector data point:
  - Switches to company view
  - Pre-selects all companies in that sector
  - Sets the sector filter dropdown to that sector
  - Uses `_preserveSectorFilter` flag to prevent the filter from being reset during panel rebuild

## Plotly Trace Mapping

- Each selected company (or sector) becomes one Plotly trace
- Trace color determined by sector color map
- Hover tooltips show: company name, sector (if different from company), country of ultimate owner, x and y values (formatted), year
- Value formatting: `$B`/`$M`/`$K` for currency, percentage for Tax Rate
- Tax Rate axes use `.0%` tick format

## Error Handling

- **CSV fetch fails:** inline error message in chart area ("Unable to load data: [error]")
- **No data-csv-url attribute:** inline error message
- **No selections:** empty chart with prompt ("Select companies or sectors to begin")
- **Missing/bad numeric values:** parsed as null, skipped in charts
- **Division by zero:** derived values where denominator is zero or null → null (omitted from chart)
- **No data for selected year:** empty chart with message ("No data for current selection (year)")

## Tech Stack

- Plain HTML, CSS, JavaScript — no build step, no framework
- Plotly.js 2.x loaded via CDN
- All styles scoped with `.taxchart-` prefix to avoid leaking into host page
- Self-contained within a `<div>` for embedding
- Viewport-fit layout (`height: 100vh`, flex column, `overflow: hidden`)
- Minimum supported width: 600px. Controls stack vertically on narrower screens

## File Structure

| File | Responsibility |
|------|---------------|
| `index.html` | HTML shell with inline body style, CDN link for Plotly, script tags, container div |
| `styles.css` | Scoped styles (`.taxchart-` prefix), responsive breakpoint at 600px |
| `data.js` | Fetch CSV, parse with null handling, compute derived values, sector aggregation, build metadata (color maps, company/sector lists) |
| `charts.js` | All four chart mode trace builders, layout builder, `Plotly.restyle` highlighting, drill-down handler, tooltip/value formatting |
| `controls.js` | Config arrays (axis pairs, metrics, field labels), state object, app init, top controls, side panel with combined sector filter/highlight, checkbox list with pinning |

### Shared State

A global object `window.TaxChart.state` holding:
- `mode` — current chart mode ('scatter', 'trails', 'bar', 'line')
- `axisPairIndex` — selected axis pair index (scatter/trails modes)
- `metricIndex` — selected metric index (bar/line modes)
- `yearIndex` — selected year index
- `viewBy` — 'companies' or 'sectors'
- `selected` — object of selected company/sector names (keys = names, values = true)
- `highlightSector` — sector to highlight (or null)
- `sortDescending` — boolean for bar chart sorting
- `rows` — parsed CSV data
- `sectorRows` — aggregated sector data
- `metadata` — sectors, companies, years, sectorColorMap, companySectorMap

`controls.js` mutates state and calls `charts.js` to re-render.

### Initialization

The app is initialized by calling `TaxChart.init(containerSelector)`, which reads the `data-csv-url` attribute from the container element, fetches and parses the data, and renders the controls and chart.

```html
<div id="tax-chart" class="taxchart" data-csv-url="data/tax-data.csv"></div>
<script>TaxChart.init('#tax-chart');</script>
```

## Test Data

`test-data.csv` contains 100 companies across 16 sectors over 3 financial years (2020-21 through 2022-23), ~300 rows total. Uses real company names from the ATO dataset with fictional sector and country values. Includes ~90 rows with blank Taxable Income and Tax Payable to test null handling. Tax rates vary from 5% to 40%.
