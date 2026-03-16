---
name: TaxChart app implementation status
description: Browser-based corporate tax data explorer - current state and architecture after initial implementation
type: project
---

Interactive chart app for Australian corporate tax transparency data, built with plain HTML/CSS/JS + Plotly.js (no framework, no build step).

**Architecture:**
- `index.html` - shell with Plotly CDN, loads data.js, charts.js, controls.js
- `data.js` - CSV fetch/parse, null handling, derived values (Tax Rate), sector aggregation, metadata
- `charts.js` - Plotly trace builders (scatter, trails, bar, line), layout, highlight, drill-down
- `controls.js` - top bar controls, side panel (company/sector selection, search, filter)
- `styles.css` - all styles scoped with `.taxchart-` prefix, 100vh viewport fit
- `test-data.csv` - 100 companies, 16 sectors, 3 years, ~300 rows with nulls

**Key design decisions:**
- Global namespace `window.TaxChart` with shared state object
- `data-csv-url` attribute on container div for configuration
- Side panel checkbox list serves as legend (Plotly legend disabled)
- Selected items pinned to top of list
- Single sector dropdown does both filtering and highlighting
- Sector drill-down from sector view to company view
- `Plotly.restyle` for efficient highlight updates (no full redraw)
- Bar chart: `categoryorder: 'trace'`, `tickangle: -45`, 150px bottom margin
- Tax Rate displayed as percentage throughout

**Current state (2026-03-16):** All features implemented and working. Spec and CLAUDE.md updated to match current code. Design spec at `docs/superpowers/specs/2026-03-16-tax-chart-app-design.md`. Plan at `docs/superpowers/plans/2026-03-16-tax-chart-app.md` (reflects original implementation, not post-implementation tweaks).

**Why:** User is iteratively building and refining this app. May return with more UI/UX tweaks.

**How to apply:** When user returns, read the design spec for context and the current source files for latest state.
