# Project
A browser-based interactive chart app for Australian corporate tax transparency data.
- Embedded within a broader web page, fits viewport height (no scrolling)
- Data: CSV loaded via fetch() from URL in `data-csv-url` attribute
- Columns: Company, Country of Ultimate Owner, Sector, Total Income (Revenue), Taxable Income, Tax Payable, Financial Year
- Some rows have null/blank Taxable Income and Tax Payable (ATO rules)
- Derived: Tax Rate = Tax Payable / Taxable Income (displayed as percentage)
- Chart modes: Scatter, Scatter with Trails, Bar, Line
- Side panel with company/sector selection (checkboxes, search, select/clear all, selected pinned to top)
- Combined sector filter/highlight dropdown (filters list + highlights on chart)
- Sector drill-down, consistent sector color palette
- Pre-defined axis pairs for scatter; single metric dropdown for bar/line
- Year slider for scatter/bar modes
- Bar chart: sort descending option, angled labels, no Plotly legend (side panel is the legend)
- Tech: plain HTML/CSS/JS, Plotly.js 2.x via CDN, no build step
- Files: index.html, styles.css, data.js, charts.js, controls.js
- Design spec: docs/superpowers/specs/2026-03-16-tax-chart-app-design.md
