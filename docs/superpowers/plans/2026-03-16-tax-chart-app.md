# Tax Data Chart App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based interactive chart app that visualizes Australian corporate tax data with scatter, trail, bar, and line chart modes, filterable by company and sector.

**Architecture:** Plain HTML/CSS/JS app, self-contained in a `<div>` for embedding. Plotly.js (CDN) handles all chart rendering. Three JS files handle data loading (`data.js`), chart rendering (`charts.js`), and UI controls (`controls.js`). Shared state on `window.TaxChart.state`.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Plotly.js 2.x via CDN. Requires a modern browser (uses `fetch()`, `Array` methods).

---

## File Map

| File | Create/Modify | Responsibility |
|------|--------------|----------------|
| `index.html` | Create | HTML shell, CDN links, script tags, container div |
| `styles.css` | Create | All styles, scoped with `.taxchart-` prefix |
| `data.js` | Create | CSV fetch/parse, derived values, sector aggregation, color map |
| `charts.js` | Create | Plotly rendering for all 4 chart modes, highlighting, tooltips |
| `controls.js` | Create | UI event handlers, search/filter, state management, init |
| `test-data.csv` | Exists | 100 companies, 16 sectors, 3 years, with nulls |

---

## Chunk 1: Data Layer

### Task 1: Project skeleton and HTML shell

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Corporate Tax Data Explorer</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="tax-chart" class="taxchart" data-csv-url="test-data.csv"></div>

  <script src="data.js"></script>
  <script src="charts.js"></script>
  <script src="controls.js"></script>
  <script>TaxChart.init('#tax-chart');</script>
</body>
</html>
```

- [ ] **Step 2: Create empty JS files as placeholders**

Create `data.js`, `charts.js`, `controls.js` each with just a namespace setup:

```js
// data.js
window.TaxChart = window.TaxChart || {};
```

```js
// charts.js
window.TaxChart = window.TaxChart || {};
```

```js
// controls.js
window.TaxChart = window.TaxChart || {};
```

- [ ] **Step 3: Create minimal `styles.css`**

```css
/* styles.css — all rules scoped with .taxchart- prefix */
.taxchart {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: #333;
  max-width: 1200px;
}
```

- [ ] **Step 4: Verify page loads**

Open `index.html` in a browser. Confirm no console errors (other than `TaxChart.init is not a function` which is expected — we haven't written it yet).

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css data.js charts.js controls.js
git commit -m "feat: project skeleton with HTML shell and empty JS modules"
```

---

### Task 2: CSV parsing and data model

**Files:**
- Modify: `data.js`

- [ ] **Step 1: Write CSV fetch and parse function**

In `data.js`, implement `TaxChart.loadData(url)` that returns a promise resolving to an array of row objects. Handle:
- Splitting by newlines, then by commas
- Mapping header names to object keys
- Converting numeric fields (Total Income, Taxable Income, Tax Payable) to numbers
- Treating empty/blank numeric fields as `null`
- Trimming whitespace from all values

```js
window.TaxChart = window.TaxChart || {};

TaxChart.NUMERIC_FIELDS = ['Total Income', 'Taxable Income', 'Tax Payable'];

TaxChart.loadData = function(url) {
  return fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('Failed to load CSV');
      return response.text();
    })
    .then(function(text) {
      return TaxChart.parseCSV(text);
    });
};

TaxChart.parseCSV = function(text) {
  var lines = text.trim().split('\n');
  var headers = lines[0].split(',').map(function(h) { return h.trim(); });
  var rows = [];

  for (var i = 1; i < lines.length; i++) {
    var values = TaxChart.splitCSVLine(lines[i]);
    if (values.length !== headers.length) continue;

    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = values[j].trim();
      if (TaxChart.NUMERIC_FIELDS.indexOf(headers[j]) !== -1) {
        row[headers[j]] = val === '' ? null : Number(val);
        if (row[headers[j]] !== null && isNaN(row[headers[j]])) {
          row[headers[j]] = null;
        }
      } else {
        row[headers[j]] = val;
      }
    }
    rows.push(row);
  }
  return rows;
};

TaxChart.splitCSVLine = function(line) {
  // Simple CSV split — handles quoted fields with commas
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
};
```

- [ ] **Step 2: Verify parsing in browser console**

Open `index.html`, then in browser console run:

```js
TaxChart.loadData('test-data.csv').then(function(rows) {
  console.log('Row count:', rows.length);
  console.log('First row:', rows[0]);
  console.log('Null check:', rows.filter(function(r) { return r['Taxable Income'] === null; }).length, 'rows with null Taxable Income');
});
```

Expected: 300 rows, first row has numeric `Total Income`, some rows have `null` Taxable Income.

- [ ] **Step 3: Commit**

```bash
git add data.js
git commit -m "feat: CSV fetch and parse with null handling"
```

---

### Task 3: Derived values and sector aggregation

**Files:**
- Modify: `data.js`

- [ ] **Step 1: Add derived value computation**

Append to `data.js`:

```js
TaxChart.DERIVED_FIELDS = [
  {
    name: 'Tax Rate',
    compute: function(row) {
      if (row['Tax Payable'] === null || row['Taxable Income'] === null || row['Taxable Income'] === 0) {
        return null;
      }
      return row['Tax Payable'] / row['Taxable Income'];
    }
  }
];

TaxChart.computeDerived = function(rows) {
  rows.forEach(function(row) {
    TaxChart.DERIVED_FIELDS.forEach(function(field) {
      row[field.name] = field.compute(row);
    });
  });
  return rows;
};
```

- [ ] **Step 2: Add sector aggregation**

Append to `data.js`:

```js
TaxChart.aggregateBySector = function(rows) {
  var groups = {};

  rows.forEach(function(row) {
    var key = row['Sector'] + '||' + row['Financial Year'];
    if (!groups[key]) {
      groups[key] = {
        'Company': row['Sector'],  // Use sector name as the label
        'Country of Ultimate Owner': '',
        'Sector': row['Sector'],
        'Total Income': 0,
        'Taxable Income': 0,
        'Tax Payable': 0,
        'Financial Year': row['Financial Year'],
        _hasIncome: false,
        _hasTax: false
      };
    }
    var g = groups[key];
    if (row['Total Income'] !== null) g['Total Income'] += row['Total Income'];
    if (row['Taxable Income'] !== null) {
      g['Taxable Income'] += row['Taxable Income'];
      g._hasIncome = true;
    }
    if (row['Tax Payable'] !== null) {
      g['Tax Payable'] += row['Tax Payable'];
      g._hasTax = true;
    }
  });

  var result = [];
  Object.keys(groups).forEach(function(key) {
    var g = groups[key];
    if (!g._hasIncome) g['Taxable Income'] = null;
    if (!g._hasTax) g['Tax Payable'] = null;
    delete g._hasIncome;
    delete g._hasTax;
    result.push(g);
  });

  // Compute derived values on aggregated rows
  TaxChart.computeDerived(result);
  return result;
};
```

- [ ] **Step 3: Add sector color map and metadata extraction**

Append to `data.js`:

```js
TaxChart.SECTOR_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
  '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5'
];

TaxChart.buildMetadata = function(rows) {
  var sectors = [];
  var companies = [];
  var years = [];
  var companySectorMap = {};

  rows.forEach(function(row) {
    if (sectors.indexOf(row['Sector']) === -1) sectors.push(row['Sector']);
    if (companies.indexOf(row['Company']) === -1) companies.push(row['Company']);
    if (years.indexOf(row['Financial Year']) === -1) years.push(row['Financial Year']);
    companySectorMap[row['Company']] = row['Sector'];
  });

  sectors.sort();
  companies.sort();
  years.sort();

  var sectorColorMap = {};
  sectors.forEach(function(s, i) {
    sectorColorMap[s] = TaxChart.SECTOR_COLORS[i % TaxChart.SECTOR_COLORS.length];
  });

  return {
    sectors: sectors,
    companies: companies,
    years: years,
    sectorColorMap: sectorColorMap,
    companySectorMap: companySectorMap
  };
};
```

- [ ] **Step 4: Verify in browser console**

```js
TaxChart.loadData('test-data.csv').then(function(rows) {
  TaxChart.computeDerived(rows);
  var meta = TaxChart.buildMetadata(rows);
  console.log('Sectors:', meta.sectors.length, meta.sectors);
  console.log('Companies:', meta.companies.length);
  console.log('Years:', meta.years);
  console.log('Color map:', meta.sectorColorMap);

  // Check derived values
  var withRate = rows.filter(function(r) { return r['Tax Rate'] !== null; });
  console.log('Rows with Tax Rate:', withRate.length, 'Sample:', withRate[0]['Tax Rate']);

  // Check aggregation
  var agg = TaxChart.aggregateBySector(rows);
  console.log('Aggregated rows:', agg.length);
  console.log('Sample aggregated:', agg[0]);
});
```

Expected: 16 sectors, 100 companies, 3 years, color map with hex values, Tax Rate as decimal, aggregated rows ~48 (16 sectors x 3 years).

- [ ] **Step 5: Commit**

```bash
git add data.js
git commit -m "feat: derived values, sector aggregation, and metadata extraction"
```

---

## Chunk 2: Configuration and State

### Task 4: App configuration and state

**Files:**
- Modify: `controls.js`

- [ ] **Step 1: Define config constants and initial state**

Write the top of `controls.js`:

```js
window.TaxChart = window.TaxChart || {};

TaxChart.AXIS_PAIRS = [
  { label: 'Revenue vs Tax Payable', x: 'Total Income', y: 'Tax Payable' },
  { label: 'Revenue vs Taxable Income', x: 'Total Income', y: 'Taxable Income' },
  { label: 'Taxable Income vs Tax Payable', x: 'Taxable Income', y: 'Tax Payable' },
  { label: 'Taxable Income vs Tax Rate', x: 'Taxable Income', y: 'Tax Rate' }
];

TaxChart.SINGLE_METRICS = [
  { label: 'Total Income (Revenue)', field: 'Total Income' },
  { label: 'Taxable Income', field: 'Taxable Income' },
  { label: 'Tax Payable', field: 'Tax Payable' },
  { label: 'Tax Rate', field: 'Tax Rate' }
];

TaxChart.MODES = ['scatter', 'trails', 'bar', 'line'];

TaxChart.state = {
  mode: 'scatter',
  axisPairIndex: 0,
  metricIndex: 0,
  yearIndex: 0,      // index into metadata.years
  viewBy: 'companies',
  selected: {},       // name -> true
  highlightSector: null,
  sortDescending: false,
  // Populated on data load:
  rows: [],
  sectorRows: [],
  metadata: null
};
```

- [ ] **Step 2: Write `TaxChart.init` function**

Append to `controls.js`:

```js
TaxChart.init = function(containerSelector) {
  var container = document.querySelector(containerSelector);
  if (!container) {
    console.error('TaxChart: container not found:', containerSelector);
    return;
  }

  var csvUrl = container.getAttribute('data-csv-url');
  if (!csvUrl) {
    container.innerHTML = '<p class="taxchart-error">No data-csv-url attribute found.</p>';
    return;
  }

  TaxChart.container = container;
  container.innerHTML = '<p class="taxchart-loading">Loading data...</p>';

  TaxChart.loadData(csvUrl)
    .then(function(rows) {
      TaxChart.computeDerived(rows);
      TaxChart.state.rows = rows;
      TaxChart.state.metadata = TaxChart.buildMetadata(rows);
      TaxChart.state.sectorRows = TaxChart.aggregateBySector(rows);
      TaxChart.state.yearIndex = TaxChart.state.metadata.years.length - 1; // latest year

      TaxChart.renderApp();
    })
    .catch(function(err) {
      container.innerHTML = '<p class="taxchart-error">Unable to load data: ' + err.message + '</p>';
    });
};
```

- [ ] **Step 3: Write `TaxChart.renderApp`**

Append to `controls.js`:

```js
TaxChart.renderApp = function() {
  var container = TaxChart.container;
  container.innerHTML = '';

  // Build DOM structure
  var topBar = document.createElement('div');
  topBar.className = 'taxchart-top-bar';

  var chartArea = document.createElement('div');
  chartArea.className = 'taxchart-chart-area';
  chartArea.id = 'taxchart-plot';

  var bottomPanel = document.createElement('div');
  bottomPanel.className = 'taxchart-bottom-panel';

  container.appendChild(topBar);
  container.appendChild(chartArea);
  container.appendChild(bottomPanel);

  TaxChart.elements = {
    topBar: topBar,
    chartArea: chartArea,
    bottomPanel: bottomPanel
  };

  TaxChart.buildTopControls();
  TaxChart.buildBottomPanel();
  TaxChart.updateChart();
};
```

- [ ] **Step 4: Add stub functions so page doesn't error**

Append to `controls.js`:

```js
TaxChart.buildTopControls = function() {
  TaxChart.elements.topBar.innerHTML = '<p>Controls will go here</p>';
};

TaxChart.buildBottomPanel = function() {
  TaxChart.elements.bottomPanel.innerHTML = '<p>Selection panel will go here</p>';
};
```

And in `charts.js`:

```js
window.TaxChart = window.TaxChart || {};

TaxChart.updateChart = function() {
  var el = document.getElementById('taxchart-plot');
  if (!el) return;

  var selected = Object.keys(TaxChart.state.selected);
  if (selected.length === 0) {
    el.innerHTML = '<p class="taxchart-prompt">Select companies or sectors to begin</p>';
    return;
  }

  el.innerHTML = '<p>Chart will render here — ' + selected.length + ' items selected</p>';
};
```

- [ ] **Step 5: Verify app initializes**

Open `index.html`. Expect to see "Controls will go here", an empty chart area with "Select companies or sectors to begin", and "Selection panel will go here".

- [ ] **Step 6: Commit**

```bash
git add controls.js charts.js
git commit -m "feat: app init, state management, and DOM scaffold"
```

---

## Chunk 3: UI Controls

### Task 5: Top controls bar

**Files:**
- Modify: `controls.js`
- Modify: `styles.css`

- [ ] **Step 1: Implement `buildTopControls`**

Replace the stub `TaxChart.buildTopControls` in `controls.js`:

```js
TaxChart.buildTopControls = function() {
  var bar = TaxChart.elements.topBar;
  bar.innerHTML = '';

  // Chart mode selector
  var modeGroup = document.createElement('div');
  modeGroup.className = 'taxchart-control-group';
  var modeLabel = document.createElement('span');
  modeLabel.className = 'taxchart-label';
  modeLabel.textContent = 'Chart:';
  modeGroup.appendChild(modeLabel);

  var modeNames = { scatter: 'Scatter', trails: 'Trails', bar: 'Bar', line: 'Line' };
  TaxChart.MODES.forEach(function(mode) {
    var btn = document.createElement('button');
    btn.className = 'taxchart-mode-btn' + (TaxChart.state.mode === mode ? ' taxchart-active' : '');
    btn.textContent = modeNames[mode];
    btn.setAttribute('data-mode', mode);
    btn.addEventListener('click', function() {
      TaxChart.state.mode = mode;
      TaxChart.buildTopControls();
      TaxChart.updateChart();
    });
    modeGroup.appendChild(btn);
  });
  bar.appendChild(modeGroup);

  // Axis pair / metric dropdown
  var axisGroup = document.createElement('div');
  axisGroup.className = 'taxchart-control-group';
  var axisLabel = document.createElement('span');
  axisLabel.className = 'taxchart-label';

  var axisSelect = document.createElement('select');
  axisSelect.className = 'taxchart-select';

  var isScatterMode = TaxChart.state.mode === 'scatter' || TaxChart.state.mode === 'trails';
  if (isScatterMode) {
    axisLabel.textContent = 'Axes:';
    TaxChart.AXIS_PAIRS.forEach(function(pair, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = pair.label;
      opt.selected = (i === TaxChart.state.axisPairIndex);
      axisSelect.appendChild(opt);
    });
    axisSelect.addEventListener('change', function() {
      TaxChart.state.axisPairIndex = parseInt(this.value);
      TaxChart.updateChart();
    });
  } else {
    axisLabel.textContent = 'Metric:';
    TaxChart.SINGLE_METRICS.forEach(function(metric, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = metric.label;
      opt.selected = (i === TaxChart.state.metricIndex);
      axisSelect.appendChild(opt);
    });
    axisSelect.addEventListener('change', function() {
      TaxChart.state.metricIndex = parseInt(this.value);
      TaxChart.updateChart();
    });
  }
  axisGroup.appendChild(axisLabel);
  axisGroup.appendChild(axisSelect);
  bar.appendChild(axisGroup);

  // Year slider — visible in scatter and bar modes
  var showYear = TaxChart.state.mode === 'scatter' || TaxChart.state.mode === 'bar';
  if (showYear) {
    var yearGroup = document.createElement('div');
    yearGroup.className = 'taxchart-control-group';
    var yearLabel = document.createElement('span');
    yearLabel.className = 'taxchart-label';
    var years = TaxChart.state.metadata.years;
    yearLabel.textContent = 'Year: ' + years[TaxChart.state.yearIndex];

    var yearSlider = document.createElement('input');
    yearSlider.type = 'range';
    yearSlider.className = 'taxchart-slider';
    yearSlider.min = 0;
    yearSlider.max = years.length - 1;
    yearSlider.value = TaxChart.state.yearIndex;
    yearSlider.addEventListener('input', function() {
      TaxChart.state.yearIndex = parseInt(this.value);
      yearLabel.textContent = 'Year: ' + years[TaxChart.state.yearIndex];
      TaxChart.updateChart();
    });

    yearGroup.appendChild(yearLabel);
    yearGroup.appendChild(yearSlider);
    bar.appendChild(yearGroup);
  }

  // Sort descending checkbox — bar mode only
  if (TaxChart.state.mode === 'bar') {
    var sortGroup = document.createElement('div');
    sortGroup.className = 'taxchart-control-group';
    var sortLabel = document.createElement('label');
    sortLabel.className = 'taxchart-label';
    var sortCheck = document.createElement('input');
    sortCheck.type = 'checkbox';
    sortCheck.checked = TaxChart.state.sortDescending;
    sortCheck.addEventListener('change', function() {
      TaxChart.state.sortDescending = this.checked;
      TaxChart.updateChart();
    });
    sortLabel.appendChild(sortCheck);
    sortLabel.appendChild(document.createTextNode(' Sort descending'));
    sortGroup.appendChild(sortLabel);
    bar.appendChild(sortGroup);
  }
};
```

- [ ] **Step 2: Add top bar styles to `styles.css`**

Append to `styles.css`:

```css
.taxchart-top-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #e0e0e0;
}

.taxchart-control-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.taxchart-label {
  font-weight: 600;
  white-space: nowrap;
}

.taxchart-mode-btn {
  padding: 4px 12px;
  border: 1px solid #ccc;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 13px;
  border-radius: 3px;
}

.taxchart-mode-btn.taxchart-active {
  background: #1f77b4;
  color: white;
  border-color: #1f77b4;
}

.taxchart-mode-btn:hover:not(.taxchart-active) {
  background: #e0e0e0;
}

.taxchart-select {
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid #ccc;
  border-radius: 3px;
}

.taxchart-slider {
  width: 120px;
}

.taxchart-error {
  color: #d62728;
  padding: 20px;
}

.taxchart-loading {
  color: #666;
  padding: 20px;
}

.taxchart-prompt {
  color: #999;
  text-align: center;
  padding: 60px 20px;
  font-size: 16px;
}

.taxchart-chart-area {
  min-height: 400px;
}
```

- [ ] **Step 3: Verify controls render and respond**

Open `index.html`. Click mode buttons — they should highlight. Axis dropdown should switch between pairs/metrics when changing mode. Year slider should appear/disappear. Sort checkbox should appear only in bar mode.

- [ ] **Step 4: Commit**

```bash
git add controls.js styles.css
git commit -m "feat: top controls bar with mode, axis, year, and sort controls"
```

---

### Task 6: Bottom panel — company/sector selection

**Files:**
- Modify: `controls.js`
- Modify: `styles.css`

- [ ] **Step 1: Implement `buildBottomPanel`**

Replace the stub `TaxChart.buildBottomPanel` in `controls.js`:

```js
TaxChart.buildBottomPanel = function() {
  var panel = TaxChart.elements.bottomPanel;
  panel.innerHTML = '';

  // View toggle (Companies / Sectors)
  var toggleRow = document.createElement('div');
  toggleRow.className = 'taxchart-toggle-row';

  ['companies', 'sectors'].forEach(function(view) {
    var btn = document.createElement('button');
    btn.className = 'taxchart-mode-btn' + (TaxChart.state.viewBy === view ? ' taxchart-active' : '');
    btn.textContent = view === 'companies' ? 'Companies' : 'Sectors';
    btn.addEventListener('click', function() {
      if (TaxChart.state.viewBy === view) return;
      TaxChart.state.viewBy = view;
      TaxChart.state.selected = {};
      TaxChart.state.highlightSector = null;
      TaxChart.buildBottomPanel();
      TaxChart.updateChart();
    });
    toggleRow.appendChild(btn);
  });
  panel.appendChild(toggleRow);

  // Sector filter dropdown (only when viewing companies)
  if (TaxChart.state.viewBy === 'companies') {
    var filterRow = document.createElement('div');
    filterRow.className = 'taxchart-filter-row';

    var sectorFilter = document.createElement('select');
    sectorFilter.className = 'taxchart-select';
    var allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All sectors';
    sectorFilter.appendChild(allOpt);

    TaxChart.state.metadata.sectors.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sectorFilter.appendChild(opt);
    });

    sectorFilter.addEventListener('change', function() {
      TaxChart._sectorFilter = this.value;
      TaxChart.updateCheckboxList();
    });

    filterRow.appendChild(sectorFilter);

    // Highlight dropdown
    var hlLabel = document.createElement('span');
    hlLabel.className = 'taxchart-label';
    hlLabel.textContent = 'Highlight:';
    var hlSelect = document.createElement('select');
    hlSelect.className = 'taxchart-select';
    var noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'None';
    hlSelect.appendChild(noneOpt);
    TaxChart.state.metadata.sectors.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (TaxChart.state.highlightSector === s) opt.selected = true;
      hlSelect.appendChild(opt);
    });
    hlSelect.addEventListener('change', function() {
      TaxChart.state.highlightSector = this.value || null;
      TaxChart.applyHighlight();
    });
    filterRow.appendChild(hlLabel);
    filterRow.appendChild(hlSelect);

    panel.appendChild(filterRow);
  }

  // Search input
  var searchRow = document.createElement('div');
  searchRow.className = 'taxchart-search-row';
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'taxchart-search';
  searchInput.placeholder = TaxChart.state.viewBy === 'companies' ? 'Search companies...' : 'Search sectors...';
  searchInput.addEventListener('input', function() {
    TaxChart._searchTerm = this.value.toLowerCase();
    TaxChart.updateCheckboxList();
  });

  var clearBtn = document.createElement('button');
  clearBtn.className = 'taxchart-mode-btn';
  clearBtn.textContent = 'Clear all';
  clearBtn.addEventListener('click', function() {
    TaxChart.state.selected = {};
    TaxChart.updateCheckboxList();
    TaxChart.updateChart();
  });

  searchRow.appendChild(searchInput);
  searchRow.appendChild(clearBtn);
  panel.appendChild(searchRow);

  // Checkbox list container
  var listContainer = document.createElement('div');
  listContainer.className = 'taxchart-list';
  listContainer.id = 'taxchart-list';
  panel.appendChild(listContainer);

  TaxChart._searchTerm = '';
  TaxChart._sectorFilter = '';
  TaxChart.updateCheckboxList();
};

TaxChart.updateCheckboxList = function() {
  var listEl = document.getElementById('taxchart-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  var items;
  if (TaxChart.state.viewBy === 'companies') {
    items = TaxChart.state.metadata.companies;
    // Apply sector filter
    if (TaxChart._sectorFilter) {
      items = items.filter(function(c) {
        return TaxChart.state.metadata.companySectorMap[c] === TaxChart._sectorFilter;
      });
    }
  } else {
    items = TaxChart.state.metadata.sectors;
  }

  // Apply search filter
  if (TaxChart._searchTerm) {
    var term = TaxChart._searchTerm;
    items = items.filter(function(item) {
      return item.toLowerCase().indexOf(term) !== -1;
    });
  }

  items.forEach(function(item) {
    var label = document.createElement('label');
    label.className = 'taxchart-list-item';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!TaxChart.state.selected[item];
    cb.addEventListener('change', function() {
      if (this.checked) {
        TaxChart.state.selected[item] = true;
      } else {
        delete TaxChart.state.selected[item];
      }
      TaxChart.updateChart();
    });

    // Color swatch
    var swatch = document.createElement('span');
    swatch.className = 'taxchart-swatch';
    var sector = TaxChart.state.viewBy === 'companies'
      ? TaxChart.state.metadata.companySectorMap[item]
      : item;
    swatch.style.backgroundColor = TaxChart.state.metadata.sectorColorMap[sector] || '#999';

    label.appendChild(cb);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(' ' + item));
    listEl.appendChild(label);
  });
};
```

- [ ] **Step 2: Add bottom panel styles to `styles.css`**

Append to `styles.css`:

```css
.taxchart-bottom-panel {
  padding: 12px 0;
  border-top: 1px solid #e0e0e0;
}

.taxchart-toggle-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.taxchart-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.taxchart-search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.taxchart-search {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #ccc;
  border-radius: 3px;
}

.taxchart-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  padding: 4px;
}

.taxchart-list-item {
  display: block;
  padding: 3px 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.taxchart-list-item:hover {
  background: #f0f0f0;
}

.taxchart-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  vertical-align: middle;
}
```

- [ ] **Step 3: Verify selection UI works**

Open `index.html`. Toggle between Companies/Sectors. Search filters the list. Sector filter dropdown appears for companies. Checking items updates `TaxChart.state.selected`. Clear button deselects all. Color swatches match sector colors.

- [ ] **Step 4: Commit**

```bash
git add controls.js styles.css
git commit -m "feat: bottom panel with company/sector search, filter, and selection"
```

---

## Chunk 4: Chart Rendering

### Task 7: Scatter chart and shared rendering infrastructure

**Files:**
- Modify: `charts.js`

- [ ] **Step 1: Implement chart rendering core and scatter mode**

Replace the contents of `charts.js`:

```js
window.TaxChart = window.TaxChart || {};

TaxChart.updateChart = function() {
  var el = document.getElementById('taxchart-plot');
  if (!el) return;

  var selectedNames = Object.keys(TaxChart.state.selected);
  if (selectedNames.length === 0) {
    Plotly.purge(el);
    el.innerHTML = '<p class="taxchart-prompt">Select companies or sectors to begin</p>';
    return;
  }

  var mode = TaxChart.state.mode;
  var traces;

  if (mode === 'scatter') {
    traces = TaxChart.buildScatterTraces();
  } else if (mode === 'trails') {
    traces = TaxChart.buildTrailsTraces();
  } else if (mode === 'bar') {
    traces = TaxChart.buildBarTraces();
  } else if (mode === 'line') {
    traces = TaxChart.buildLineTraces();
  }

  if (!traces || traces.length === 0) {
    Plotly.purge(el);
    var year = TaxChart.state.metadata.years[TaxChart.state.yearIndex];
    el.innerHTML = '<p class="taxchart-prompt">No data for current selection' +
      (mode === 'scatter' || mode === 'bar' ? ' (' + year + ')' : '') + '</p>';
    return;
  }

  var layout = TaxChart.buildLayout();
  Plotly.newPlot(el, traces, layout, { responsive: true });

  // Attach drill-down click handler for sector view
  if (TaxChart.state.viewBy === 'sectors' && (mode === 'scatter' || mode === 'bar')) {
    el.on('plotly_click', TaxChart.handleDrillDown);
  }
};

TaxChart.getActiveRows = function() {
  if (TaxChart.state.viewBy === 'sectors') {
    return TaxChart.state.sectorRows;
  }
  return TaxChart.state.rows;
};

TaxChart.getColor = function(name) {
  var sector;
  if (TaxChart.state.viewBy === 'sectors') {
    sector = name;
  } else {
    sector = TaxChart.state.metadata.companySectorMap[name];
  }
  return TaxChart.state.metadata.sectorColorMap[sector] || '#999';
};

TaxChart.getOpacity = function(name) {
  var hl = TaxChart.state.highlightSector;
  if (!hl) return 1;
  var sector;
  if (TaxChart.state.viewBy === 'sectors') {
    sector = name;
  } else {
    sector = TaxChart.state.metadata.companySectorMap[name];
  }
  return sector === hl ? 1 : 0.15;
};

TaxChart.buildTooltip = function(row, xField, yField) {
  var parts = [row['Company']];
  if (row['Sector'] && row['Company'] !== row['Sector']) {
    parts.push('Sector: ' + row['Sector']);
  }
  if (row['Country of Ultimate Owner']) {
    parts.push('Country: ' + row['Country of Ultimate Owner']);
  }
  parts.push(xField + ': ' + TaxChart.formatValue(row[xField], xField));
  parts.push(yField + ': ' + TaxChart.formatValue(row[yField], yField));
  parts.push('Year: ' + row['Financial Year']);
  return parts.join('<br>');
};

TaxChart.formatValue = function(val, field) {
  if (val === null || val === undefined) return 'N/A';
  if (field === 'Tax Rate') return (val * 100).toFixed(1) + '%';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return '$' + (val / 1e3).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

TaxChart.buildScatterTraces = function() {
  var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
  var year = TaxChart.state.metadata.years[TaxChart.state.yearIndex];
  var rows = TaxChart.getActiveRows();
  var selectedNames = Object.keys(TaxChart.state.selected);
  var traces = [];

  selectedNames.forEach(function(name) {
    var filtered = rows.filter(function(r) {
      return r['Company'] === name && r['Financial Year'] === year;
    });
    if (filtered.length === 0) return;
    var row = filtered[0];
    if (row[pair.x] === null || row[pair.y] === null) return;

    traces.push({
      x: [row[pair.x]],
      y: [row[pair.y]],
      mode: 'markers',
      type: 'scatter',
      name: name,
      marker: {
        color: TaxChart.getColor(name),
        size: 10,
        opacity: TaxChart.getOpacity(name)
      },
      text: [TaxChart.buildTooltip(row, pair.x, pair.y)],
      hoverinfo: 'text'
    });
  });

  return traces;
};

TaxChart.buildLayout = function() {
  var mode = TaxChart.state.mode;
  var layout = {
    margin: { t: 30, r: 30, b: 50, l: 70 },
    showlegend: true,
    legend: { orientation: 'h', y: -0.15 },
    hovermode: 'closest'
  };

  if (mode === 'scatter' || mode === 'trails') {
    var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
    layout.xaxis = { title: pair.x };
    layout.yaxis = { title: pair.y };
  } else {
    var metric = TaxChart.SINGLE_METRICS[TaxChart.state.metricIndex];
    if (mode === 'bar') {
      layout.xaxis = { title: '' };
      layout.yaxis = { title: metric.label };
    } else {
      layout.xaxis = { title: 'Financial Year' };
      layout.yaxis = { title: metric.label };
    }
  }

  return layout;
};

// Efficient highlight update using Plotly.restyle (no full redraw)
TaxChart.applyHighlight = function() {
  var el = document.getElementById('taxchart-plot');
  if (!el || !el.data || el.data.length === 0) return;

  var updates = [];
  el.data.forEach(function(trace, i) {
    var name = trace.name;
    var opacity = TaxChart.getOpacity(name);
    updates.push(i);
  });

  // Build opacity array for all traces
  var opacities = el.data.map(function(trace) {
    return TaxChart.getOpacity(trace.name);
  });

  // For scatter/line traces, update opacity; for bar traces, update marker.opacity
  var mode = TaxChart.state.mode;
  if (mode === 'bar') {
    Plotly.restyle(el, { 'marker.opacity': opacities.map(function(o) { return [o]; }) });
  } else {
    Plotly.restyle(el, { opacity: opacities });
  }
};
```

- [ ] **Step 2: Verify scatter chart renders**

Open `index.html`. Select a few companies. Scatter chart should show colored dots. Hover shows tooltip with company, sector, country, values, year. Change axis pair — chart updates. Change year — chart updates.

- [ ] **Step 3: Commit**

```bash
git add charts.js
git commit -m "feat: scatter chart rendering with tooltips and formatting"
```

---

### Task 8: Trails, bar, and line chart modes

**Files:**
- Modify: `charts.js`

- [ ] **Step 1: Implement trails traces**

Add to `charts.js` before `buildLayout`:

```js
TaxChart.buildTrailsTraces = function() {
  var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
  var rows = TaxChart.getActiveRows();
  var selectedNames = Object.keys(TaxChart.state.selected);
  var years = TaxChart.state.metadata.years;
  var traces = [];

  selectedNames.forEach(function(name) {
    var companyRows = rows.filter(function(r) {
      return r['Company'] === name;
    });
    // Sort by year
    companyRows.sort(function(a, b) {
      return years.indexOf(a['Financial Year']) - years.indexOf(b['Financial Year']);
    });

    var x = [], y = [], texts = [];
    companyRows.forEach(function(row) {
      if (row[pair.x] === null || row[pair.y] === null) return;
      x.push(row[pair.x]);
      y.push(row[pair.y]);
      texts.push(TaxChart.buildTooltip(row, pair.x, pair.y));
    });

    if (x.length === 0) return;

    traces.push({
      x: x,
      y: y,
      mode: 'lines+markers',
      type: 'scatter',
      name: name,
      line: { color: TaxChart.getColor(name) },
      marker: { color: TaxChart.getColor(name), size: 8 },
      opacity: TaxChart.getOpacity(name),
      text: texts,
      hoverinfo: 'text'
    });
  });

  return traces;
};
```

- [ ] **Step 2: Implement bar traces**

Add to `charts.js`:

```js
TaxChart.buildBarTraces = function() {
  var metric = TaxChart.SINGLE_METRICS[TaxChart.state.metricIndex];
  var year = TaxChart.state.metadata.years[TaxChart.state.yearIndex];
  var rows = TaxChart.getActiveRows();
  var selectedNames = Object.keys(TaxChart.state.selected);

  var items = [];
  selectedNames.forEach(function(name) {
    var filtered = rows.filter(function(r) {
      return r['Company'] === name && r['Financial Year'] === year;
    });
    if (filtered.length === 0) return;
    var row = filtered[0];
    if (row[metric.field] === null) return;
    items.push({ name: name, value: row[metric.field], row: row });
  });

  if (TaxChart.state.sortDescending) {
    items.sort(function(a, b) { return b.value - a.value; });
  }

  // One trace per entity so each gets a legend entry
  var traces = [];
  items.forEach(function(item) {
    traces.push({
      x: [item.name],
      y: [item.value],
      type: 'bar',
      name: item.name,
      marker: {
        color: TaxChart.getColor(item.name),
        opacity: TaxChart.getOpacity(item.name)
      },
      text: [item.name + '<br>' + metric.label + ': ' + TaxChart.formatValue(item.value, metric.field)],
      hoverinfo: 'text'
    });
  });

  return traces;
};
```

- [ ] **Step 3: Implement line traces**

Add to `charts.js`:

```js
TaxChart.buildLineTraces = function() {
  var metric = TaxChart.SINGLE_METRICS[TaxChart.state.metricIndex];
  var rows = TaxChart.getActiveRows();
  var selectedNames = Object.keys(TaxChart.state.selected);
  var years = TaxChart.state.metadata.years;
  var traces = [];

  selectedNames.forEach(function(name) {
    var companyRows = rows.filter(function(r) {
      return r['Company'] === name;
    });
    companyRows.sort(function(a, b) {
      return years.indexOf(a['Financial Year']) - years.indexOf(b['Financial Year']);
    });

    var x = [], y = [], texts = [];
    companyRows.forEach(function(row) {
      if (row[metric.field] === null) return;
      x.push(row['Financial Year']);
      y.push(row[metric.field]);
      texts.push(row['Company'] + '<br>' + metric.label + ': ' + TaxChart.formatValue(row[metric.field], metric.field));
    });

    if (x.length === 0) return;

    traces.push({
      x: x,
      y: y,
      mode: 'lines+markers',
      type: 'scatter',
      name: name,
      line: { color: TaxChart.getColor(name) },
      marker: { color: TaxChart.getColor(name), size: 6 },
      opacity: TaxChart.getOpacity(name),
      text: texts,
      hoverinfo: 'text'
    });
  });

  return traces;
};
```

- [ ] **Step 4: Verify all chart modes work**

Open `index.html`. Select several companies. Switch between all four modes:
- Scatter: dots positioned by axis pair, year slider works
- Trails: dots connected by lines across years
- Bar: vertical bars, sort descending checkbox works
- Line: lines over financial years

- [ ] **Step 5: Commit**

```bash
git add charts.js
git commit -m "feat: trails, bar, and line chart modes"
```

---

### Task 9: Sector drill-down

**Files:**
- Modify: `charts.js`

- [ ] **Step 1: Implement drill-down handler**

Add to `charts.js`:

```js
TaxChart.handleDrillDown = function(eventData) {
  if (TaxChart.state.viewBy !== 'sectors') return;

  var pointData = eventData.points[0];
  if (!pointData) return;

  var sectorName = pointData.data.name || pointData.x;
  if (!sectorName) return;

  // Switch to companies view, filtered by this sector
  TaxChart.state.viewBy = 'companies';
  TaxChart.state.selected = {};

  // Select all companies in this sector
  var companiesInSector = TaxChart.state.metadata.companies.filter(function(c) {
    return TaxChart.state.metadata.companySectorMap[c] === sectorName;
  });
  companiesInSector.forEach(function(c) {
    TaxChart.state.selected[c] = true;
  });

  // Set sector filter BEFORE building the panel so the dropdown and list are in sync
  TaxChart._sectorFilter = sectorName;
  TaxChart.buildBottomPanel();

  // Now set the sector filter dropdown to match
  var sectorDropdown = TaxChart.elements.bottomPanel.querySelector('.taxchart-select');
  if (sectorDropdown) sectorDropdown.value = sectorName;
  TaxChart.updateCheckboxList();
  TaxChart.updateChart();
};
```

- [ ] **Step 2: Verify drill-down**

Open `index.html`. Switch to Sectors view, select a few sectors. Click on a sector data point — app should switch to Companies view showing that sector's companies.

- [ ] **Step 3: Commit**

```bash
git add charts.js
git commit -m "feat: sector drill-down from aggregated view to company view"
```

---

## Chunk 5: Polish

### Task 10: Responsive layout

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add responsive styles**

Append to `styles.css`:

```css
@media (max-width: 600px) {
  .taxchart-top-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .taxchart-filter-row {
    flex-wrap: wrap;
  }

  .taxchart-slider {
    width: 100%;
  }
}
```

- [ ] **Step 2: Verify responsive behavior**

Open `index.html` and resize browser window to < 600px. Controls should stack vertically.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: responsive layout for narrow screens"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full walkthrough**

Test the complete app:
1. Page loads, data populates controls
2. Scatter mode: select 5+ companies from different sectors, verify dots, tooltips, axis pair switching, year slider
3. Trails mode: same companies, verify connected lines across years
4. Bar mode: verify bars, sort descending toggle, year slider
5. Line mode: verify lines over financial years
6. Switch to Sectors view: verify aggregation, drill-down on click
7. Sector highlighting: select a sector to highlight, verify others fade
8. Search: type a partial name, verify list filters
9. Clear: verify all deselected
10. Error states: verify empty state message shows when nothing selected

- [ ] **Step 2: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final polish and verification"
```
