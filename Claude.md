# Project
A browser based chart app that plots multiple series of  data on two axes. 
- The data series is located at a URL and is .csv file with first line header.
- The CSV URL may be on the same server or external; loaded via fetch() at runtime.
- The app will be embedded as a section within a broader web page (not a standalone page).
- Columns are: Company, Country of Ultimate Owner, Sector, Total Income (Revenue), Taxable Income, Tax Payable, Financial Year.
- The base ATO dataset has: Name, ABN, Total Income, Taxable Income, Tax Payable, Income Year. Sector and Country of Ultimate Owner must be enriched from another source.
- Some rows may have null/blank Taxable Income and Tax Payable (ATO rules: not reported when zero or negative). App should handle gracefully.
- Chart modes:
  1. Scatter — two numeric axes, one point per company/sector for a selected financial year
  2. Scatter with trails — same axes, but points across multiple financial years connected by lines showing trajectory
  3. Bar chart — x-axis is companies or sectors, y-axis is a chosen metric. Option to sort descending.
  4. Line chart — x-axis is Financial Year, y-axis is a chosen metric, one line per company/sector
- The app will permit different series to be plotted based on selection of one or more Companies, or Sectors
- If charting by sector, totals of values for all companies in that sector
- Sector drill-down: clicking a sector data point shows individual companies within it
- Sector filtering: when viewing many companies, filter by sector
- Sector highlighting: selecting a sector highlights its companies, all others fade to grey
- Consistent color palette per sector across all chart modes
- Financial year selection: slider for single year in scatter mode; all years used automatically for trails/line modes
- Pre-defined axis pairs available for selection in scatter modes (e.g. Revenue vs Tax Payable, Revenue vs Taxable Income, Taxable Income vs Tax Payable). Some pairs may use derived values (e.g. Tax Rate = Tax Payable / Taxable Income). Exact list to be refined.
- Company/sector selection via search-and-filter with checkboxes, with option to clear all selections
- Tech: plain HTML/CSS/JS, Plotly.js via CDN, no build step
