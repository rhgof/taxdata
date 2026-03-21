/**
 * controls.js — UI controls and state management for TaxChart.
 *
 * Responsibilities:
 *   - Configuration constants (field labels, axis pairs, metrics, modes)
 *   - Application state (selections, view mode, axis/metric indices, log scale)
 *   - Initialization: fetch data, compute derived fields, render app shell
 *   - Top bar: chart mode buttons, axis/metric dropdown, year slider, log toggles
 *   - Side panel: company/sector toggle, multi-select sector dropdown, search,
 *     select-all checkbox, scrollable checkbox list with colored swatches
 */
window.TaxChart = window.TaxChart || {};

// Display labels for fields (e.g. "Total Income" → "Total Income (Revenue)")
TaxChart.FIELD_LABELS = {
  'Total Income': 'Total Income (Revenue)',
  'Taxable Income': 'Taxable Income',
  'Tax Payable': 'Tax Payable',
  'Tax Rate': 'Tax Rate',
  'Taxable Income Margin': 'Taxable Income Margin',
  'Tax Revenue Rate': 'Tax Revenue Rate'
};

// Pre-defined X/Y axis pairs for scatter and trails modes
TaxChart.AXIS_PAIRS = [
  { label: 'Total Income (Revenue) vs Tax Payable', x: 'Total Income', y: 'Tax Payable' },
  { label: 'Total Income (Revenue) vs Taxable Income', x: 'Total Income', y: 'Taxable Income' },
  { label: 'Taxable Income vs Tax Payable', x: 'Taxable Income', y: 'Tax Payable' },
  { label: 'Taxable Income vs Tax Rate', x: 'Taxable Income', y: 'Tax Rate' },
  { label: 'Total Income (Revenue) vs Tax Revenue Rate', x: 'Total Income', y: 'Tax Revenue Rate' }
];

// Single-metric options for bar and line modes
TaxChart.SINGLE_METRICS = [
  { label: 'Total Income (Revenue)', field: 'Total Income' },
  { label: 'Taxable Income', field: 'Taxable Income' },
  { label: 'Tax Payable', field: 'Tax Payable' },
  { label: 'Tax Rate', field: 'Tax Rate' },
  { label: 'Taxable Income Margin', field: 'Taxable Income Margin' },
  { label: 'Tax Revenue Rate', field: 'Tax Revenue Rate' }
];

TaxChart.MODES = ['scatter', 'trails', 'bar', 'bar-time', 'line'];

// Global application state — mutated by controls, read by chart builders
TaxChart.state = {
  mode: 'scatter',
  axisPairIndex: 0,
  metricIndex: 0,
  yearIndex: 0,
  viewBy: 'companies',
  selected: {},
  selectedSectors: {},
  highlightSector: null,
  sortDescending: false,
  sortField: 'Total Income',
  pinnedLabels: {},
  logScaleX: false,
  logScaleY: false,
  autoScale: false,
  asxOnly: true,
  topN: 0,
  allRows: [],
  rows: [],
  sectorRows: [],
  metadata: null
};

// Initialize the app: find container, load CSV from data-csv-url attribute,
// compute derived fields and metadata, then render the full UI.
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
      TaxChart.state.allRows = rows;
      TaxChart.applyDataFilters();
      TaxChart.state.yearIndex = TaxChart.state.metadata.years.length - 1;
      // Select all visible companies and sectors by default
      TaxChart.state.metadata.companies.forEach(function(c) {
        TaxChart.state.selected[c] = true;
      });
      TaxChart.state.metadata.sectors.forEach(function(s) {
        TaxChart.state.selectedSectors[s] = true;
      });
      TaxChart.computeAxisRanges();
      TaxChart.renderApp();
    })
    .catch(function(err) {
      container.innerHTML = '<p class="taxchart-error">Unable to load data: ' + err.message + '</p>';
    });
};

// Compute fixed axis ranges separately for company and sector data
TaxChart.computeAxisRanges = function() {
  var fields = ['Total Income', 'Taxable Income', 'Tax Payable', 'Tax Rate', 'Taxable Income Margin', 'Tax Revenue Rate'];

  function computeRanges(rows) {
    var ranges = {};
    fields.forEach(function(field) {
      var min = Infinity, max = -Infinity;
      rows.forEach(function(row) {
        if (row[field] !== null && row[field] !== undefined) {
          if (row[field] < min) min = row[field];
          if (row[field] > max) max = row[field];
        }
      });
      if (min === Infinity) { min = 0; max = 1; }
      ranges[field] = { min: min, max: max };
    });
    return ranges;
  }

  TaxChart.state.axisRangesCompanies = computeRanges(TaxChart.state.rows);
  TaxChart.state.axisRangesSectors = computeRanges(TaxChart.state.sectorRows);
};

// Apply ASX Listed and Top N filters to allRows, rebuild rows/metadata/sectorRows.
// Top N ranks companies by max Total Income over the last 5 financial years.
// Why max-over-5-years instead of latest year only:
//   - ~8% of the top 200 differ between the two methods
//   - Latest-year misses companies having a bad year or missing data (e.g. restructured entities)
//   - Max-over-5-years retains companies like Sandfire Resources ($972M peak) and Coronado ($1.2B peak)
//     that report $0 in the latest year due to entity changes
//   - Fast growers still appear since their latest year IS their max
//   - Average-over-5-years was considered but penalises companies that only recently grew large
TaxChart.applyDataFilters = function() {
  var allRows = TaxChart.state.allRows;
  var filtered = allRows;

  // ASX Listed filter
  if (TaxChart.state.asxOnly) {
    filtered = filtered.filter(function(r) { return r['ASX Listed']; });
  }

  // Top N filter: rank by max Total Income over last 5 years, keep top N company names
  if (TaxChart.state.topN > 0) {
    var years = [];
    filtered.forEach(function(r) {
      if (years.indexOf(r['Financial Year']) === -1) years.push(r['Financial Year']);
    });
    years.sort();
    var last5 = years.slice(-5);

    // Build company → max total income over last 5 years
    var companyIncome = {};
    filtered.forEach(function(r) {
      if (last5.indexOf(r['Financial Year']) !== -1 && r['Total Income'] !== null) {
        var c = r['Company'];
        if (companyIncome[c] === undefined || r['Total Income'] > companyIncome[c]) {
          companyIncome[c] = r['Total Income'];
        }
      }
    });

    // Sort and take top N
    var ranked = Object.keys(companyIncome).sort(function(a, b) {
      return companyIncome[b] - companyIncome[a];
    });
    var topNames = {};
    for (var i = 0; i < Math.min(TaxChart.state.topN, ranked.length); i++) {
      topNames[ranked[i]] = true;
    }

    filtered = filtered.filter(function(r) { return topNames[r['Company']]; });
  }

  TaxChart.state.rows = filtered;
  TaxChart.state.metadata = TaxChart.buildMetadata(filtered);
  TaxChart.state.sectorRows = TaxChart.aggregateBySector(filtered);
};

// Reapply data filters and rebuild the full UI (called when ASX/TopN change).
// Preserves sector and company selections where they still exist in the new data.
TaxChart.rebuildAfterFilter = function() {
  TaxChart.applyDataFilters();

  // Preserve existing sector selections, remove sectors no longer in data
  var oldSectors = TaxChart.state.selectedSectors;
  TaxChart.state.selectedSectors = {};
  TaxChart.state.metadata.sectors.forEach(function(s) {
    if (oldSectors[s]) TaxChart.state.selectedSectors[s] = true;
  });

  // Rebuild company selections based on preserved sector selections
  var oldSelected = TaxChart.state.selected;
  TaxChart.state.selected = {};
  TaxChart.state.metadata.companies.forEach(function(c) {
    var sector = TaxChart.state.metadata.companySectorMap[c];
    // Keep if sector is still selected, or if previously individually selected
    if (TaxChart.state.selectedSectors[sector] || oldSelected[c]) {
      TaxChart.state.selected[c] = true;
    }
  });

  TaxChart.computeAxisRanges();
  TaxChart.buildSidePanel();
  TaxChart.syncSectorUI();
  TaxChart.updateChart();
};

// Build the app shell: top control bar + main area (chart + side panel)
TaxChart.renderApp = function() {
  var container = TaxChart.container;
  container.innerHTML = '';

  var title = document.createElement('div');
  title.className = 'taxchart-title';
  title.textContent = 'ATO Corporate Tax Transparency';

  var years = TaxChart.state.metadata.years;
  var subtitle = document.createElement('div');
  subtitle.className = 'taxchart-subtitle';
  subtitle.textContent = 'Report of Entity Tax Information ' + years[0] + ' to ' + years[years.length - 1];

  var topBar = document.createElement('div');
  topBar.className = 'taxchart-top-bar';

  var mainArea = document.createElement('div');
  mainArea.className = 'taxchart-main-area';

  var chartArea = document.createElement('div');
  chartArea.className = 'taxchart-chart-area';
  chartArea.id = 'taxchart-plot';

  var sidePanel = document.createElement('div');
  sidePanel.className = 'taxchart-side-panel';

  mainArea.appendChild(chartArea);
  mainArea.appendChild(sidePanel);

  container.appendChild(title);
  container.appendChild(subtitle);
  container.appendChild(topBar);
  container.appendChild(mainArea);

  TaxChart.elements = {
    topBar: topBar,
    chartArea: chartArea,
    sidePanel: sidePanel
  };

  TaxChart.buildTopControls();
  TaxChart.buildSidePanel();
  // TaxChart.buildFloatingLegend();
  TaxChart.updateChart();
};

// Build the top control bar: mode buttons, axis/metric dropdown, year slider,
// sort toggle (bar only), and log scale checkboxes.
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

  var modeNames = { scatter: 'Scatter', trails: 'Trails', bar: 'Bar', 'bar-time': 'Bar (Time)', line: 'Line' };
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

  // Scale options row: Log X, Log Y, Autoscale (forced onto new line)
  var scaleRow = document.createElement('div');
  scaleRow.className = 'taxchart-control-group';
  scaleRow.style.width = '100%';

  var logXLabel = document.createElement('label');
  logXLabel.className = 'taxchart-label';
  var logXCheck = document.createElement('input');
  logXCheck.type = 'checkbox';
  logXCheck.checked = TaxChart.state.logScaleX;
  logXCheck.addEventListener('change', function() {
    TaxChart.state.logScaleX = this.checked;
    TaxChart.updateChart();
  });
  logXLabel.appendChild(logXCheck);
  logXLabel.appendChild(document.createTextNode(' Log X'));

  var logYLabel = document.createElement('label');
  logYLabel.className = 'taxchart-label';
  var logYCheck = document.createElement('input');
  logYCheck.type = 'checkbox';
  logYCheck.checked = TaxChart.state.logScaleY;
  logYCheck.addEventListener('change', function() {
    TaxChart.state.logScaleY = this.checked;
    TaxChart.updateChart();
  });
  logYLabel.appendChild(logYCheck);
  logYLabel.appendChild(document.createTextNode(' Log Y'));

  var autoScaleLabel = document.createElement('label');
  autoScaleLabel.className = 'taxchart-label';
  var autoScaleCheck = document.createElement('input');
  autoScaleCheck.type = 'checkbox';
  autoScaleCheck.checked = TaxChart.state.autoScale;
  autoScaleCheck.addEventListener('change', function() {
    TaxChart.state.autoScale = this.checked;
    TaxChart.updateChart();
  });
  autoScaleLabel.appendChild(autoScaleCheck);
  autoScaleLabel.appendChild(document.createTextNode(' Autoscale'));

  scaleRow.appendChild(logXLabel);
  scaleRow.appendChild(logYLabel);
  scaleRow.appendChild(autoScaleLabel);
  bar.appendChild(scaleRow);

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

  // Year slider (not shown for trails, bar-time, or line — they show all years)
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

  // Sort controls — bar and bar-time modes: descending checkbox + sort-by dropdown
  if (TaxChart.state.mode === 'bar' || TaxChart.state.mode === 'bar-time') {
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
    sortLabel.appendChild(document.createTextNode(' Sort by:'));
    sortGroup.appendChild(sortLabel);

    var sortSelect = document.createElement('select');
    sortSelect.className = 'taxchart-select';
    TaxChart.SINGLE_METRICS.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.field;
      opt.textContent = m.label;
      opt.selected = (m.field === TaxChart.state.sortField);
      sortSelect.appendChild(opt);
    });
    sortSelect.addEventListener('change', function() {
      TaxChart.state.sortField = this.value;
      if (TaxChart.state.sortDescending) TaxChart.updateChart();
    });
    sortGroup.appendChild(sortSelect);
    bar.appendChild(sortGroup);
  }

};

// Build the side panel: companies/sectors toggle, sector filter dropdown
// (companies view only), search box, select-all, and scrollable checkbox list.
TaxChart.buildSidePanel = function() {
  var panel = TaxChart.elements.sidePanel;
  panel.innerHTML = '';

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
      TaxChart.state.selectedSectors = {};
      // When switching to companies view, start with all sectors selected
      if (view === 'companies') {
        TaxChart.state.metadata.sectors.forEach(function(s) {
          TaxChart.state.selectedSectors[s] = true;
        });
        TaxChart.state.metadata.companies.forEach(function(c) {
          TaxChart.state.selected[c] = true;
        });
      }
      TaxChart.state.highlightSector = null;
      TaxChart.buildSidePanel();
      TaxChart.updateChart();
    });
    toggleRow.appendChild(btn);
  });
  panel.appendChild(toggleRow);

  // Sector panel (companies view only)
  if (TaxChart.state.viewBy === 'companies') {
    var sectorPanel = document.createElement('div');
    sectorPanel.className = 'taxchart-sector-panel';

    var sectorHeader = document.createElement('div');
    sectorHeader.className = 'taxchart-sector-panel-header';
    var sectorCollapsed = false;

    var allSectorsCb = document.createElement('input');
    allSectorsCb.type = 'checkbox';
    allSectorsCb.style.margin = '0 4px 0 0';

    var sectorLabel = document.createElement('span');
    sectorLabel.style.flex = '1';

    function updateSectorHeader() {
      var count = Object.keys(TaxChart.state.selectedSectors).length;
      var total = TaxChart.state.metadata.sectors.length;
      sectorLabel.textContent = (sectorCollapsed ? '\u25B6' : '\u25BC') + ' Sectors (' + count + '/' + total + ')';
      allSectorsCb.checked = count === total;
      allSectorsCb.indeterminate = count > 0 && count < total;
    }

    allSectorsCb.addEventListener('click', function(e) {
      e.stopPropagation();
      if (this.checked) {
        TaxChart.selectAllSectors();
      } else {
        TaxChart.clearAllSectors();
      }
      updateSectorHeader();
      TaxChart.syncSectorUI();
      TaxChart.updateCheckboxList();
      TaxChart.updateChart();
    });

    sectorHeader.appendChild(allSectorsCb);
    sectorHeader.appendChild(sectorLabel);
    updateSectorHeader();

    var sectorBody = document.createElement('div');
    sectorBody.className = 'taxchart-sector-panel-body';

    sectorHeader.addEventListener('click', function(e) {
      if (e.target === allSectorsCb) return;
      sectorCollapsed = !sectorCollapsed;
      sectorBody.style.display = sectorCollapsed ? 'none' : 'block';
      updateSectorHeader();
    });

    var panelCheckboxes = {};
    TaxChart.state.metadata.sectors.forEach(function(s) {
      var item = document.createElement('label');
      item.className = 'taxchart-sector-dropdown-item';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!TaxChart.state.selectedSectors[s];
      panelCheckboxes[s] = cb;

      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        TaxChart.toggleSector(s, this.checked);
        updateSectorHeader();
        TaxChart.syncSectorUI();
        TaxChart.updateCheckboxList();
        TaxChart.updateChart();
      });

      var swatch = document.createElement('span');
      swatch.className = 'taxchart-swatch';
      swatch.style.backgroundColor = TaxChart.state.metadata.sectorColorMap[s] || '#999';

      item.appendChild(cb);
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(' ' + s));
      sectorBody.appendChild(item);
    });

    sectorPanel.appendChild(sectorHeader);
    sectorPanel.appendChild(sectorBody);
    panel.appendChild(sectorPanel);

    TaxChart._updateCollapsiblePanel = function() {
      TaxChart.state.metadata.sectors.forEach(function(s) {
        if (panelCheckboxes[s]) {
          panelCheckboxes[s].checked = !!TaxChart.state.selectedSectors[s];
        }
      });
      updateSectorHeader();
    };
  }

  // Companies/entities collapsible panel: header + body (filters, search, list)
  var companyPanel = document.createElement('div');
  companyPanel.className = 'taxchart-sector-panel';

  var companyHeader = document.createElement('div');
  companyHeader.className = 'taxchart-sector-panel-header';
  var companiesCollapsed = false;

  var selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.id = 'taxchart-select-all';
  selectAllCb.style.margin = '0 4px 0 0';

  var companyLabel = document.createElement('span');
  companyLabel.style.flex = '1';

  var selectCountLabel = document.createElement('span');
  selectCountLabel.id = 'taxchart-select-count';
  selectCountLabel.className = 'taxchart-select-count';

  var entityName = TaxChart.state.viewBy === 'companies' ? 'Companies' : 'Sectors';

  function updateCompaniesHeader() {
    var visibleItems = TaxChart.getVisibleItems();
    var selectedCount = visibleItems.filter(function(item) { return !!TaxChart.state.selected[item]; }).length;
    companyLabel.textContent = (companiesCollapsed ? '\u25B6' : '\u25BC') + ' ' + entityName;
    selectCountLabel.textContent = selectedCount + '/' + visibleItems.length;
    selectAllCb.checked = visibleItems.length > 0 && selectedCount === visibleItems.length;
    selectAllCb.indeterminate = selectedCount > 0 && selectedCount < visibleItems.length;
  }

  selectAllCb.addEventListener('click', function(e) {
    e.stopPropagation();
    if (TaxChart.state.viewBy === 'companies') {
      if (this.checked) {
        TaxChart.selectAllSectors();
      } else {
        TaxChart.clearAllSectors();
      }
      TaxChart.syncSectorUI();
    } else {
      var items = TaxChart.getVisibleItems();
      if (this.checked) {
        items.forEach(function(item) { TaxChart.state.selected[item] = true; });
      } else {
        items.forEach(function(item) { delete TaxChart.state.selected[item]; });
      }
    }
    updateCompaniesHeader();
    TaxChart.updateCheckboxList();
    TaxChart.updateChart();
  });

  var companyBody = document.createElement('div');
  companyBody.className = 'taxchart-sector-panel-body';

  companyHeader.addEventListener('click', function(e) {
    if (e.target === selectAllCb) return;
    companiesCollapsed = !companiesCollapsed;
    companyBody.style.display = companiesCollapsed ? 'none' : 'block';
    updateCompaniesHeader();
  });

  companyHeader.appendChild(selectAllCb);
  companyHeader.appendChild(companyLabel);
  companyHeader.appendChild(selectCountLabel);
  updateCompaniesHeader();
  companyPanel.appendChild(companyHeader);

  // Data filter controls: ASX Listed toggle + Top N dropdown
  var filterRow = document.createElement('div');
  filterRow.className = 'taxchart-filter-row';

  var asxLabel = document.createElement('label');
  asxLabel.className = 'taxchart-label';
  var asxCheck = document.createElement('input');
  asxCheck.type = 'checkbox';
  asxCheck.checked = TaxChart.state.asxOnly;
  asxCheck.addEventListener('change', function() {
    TaxChart.state.asxOnly = this.checked;
    TaxChart.rebuildAfterFilter();
  });
  asxLabel.appendChild(asxCheck);
  asxLabel.appendChild(document.createTextNode(' ASX Listed'));
  filterRow.appendChild(asxLabel);

  var topNSelect = document.createElement('select');
  topNSelect.className = 'taxchart-select';
  var topNOptions = [
    { label: 'All', value: 0 },
    { label: 'Top 100', value: 100 },
    { label: 'Top 200', value: 200 },
    { label: 'Top 500', value: 500 },
    { label: 'Top 1000', value: 1000 }
  ];
  topNOptions.forEach(function(opt) {
    var el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    el.selected = (opt.value === TaxChart.state.topN);
    topNSelect.appendChild(el);
  });
  topNSelect.addEventListener('change', function() {
    TaxChart.state.topN = parseInt(this.value);
    TaxChart.rebuildAfterFilter();
  });
  filterRow.appendChild(topNSelect);
  companyBody.appendChild(filterRow);

  // Search box
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'taxchart-search';
  searchInput.style.marginTop = '4px';
  searchInput.placeholder = TaxChart.state.viewBy === 'companies' ? 'Search companies...' : 'Search sectors...';
  searchInput.addEventListener('input', function() {
    TaxChart._searchTerm = this.value.toLowerCase();
    TaxChart.updateCheckboxList();
  });
  companyBody.appendChild(searchInput);

  // Company/sector checkbox list
  var listContainer = document.createElement('div');
  listContainer.className = 'taxchart-list';
  listContainer.id = 'taxchart-list';
  companyBody.appendChild(listContainer);

  companyPanel.appendChild(companyBody);
  panel.appendChild(companyPanel);

  // Store updateCompaniesHeader for external calls
  TaxChart._updateCompaniesHeader = updateCompaniesHeader;

  TaxChart._searchTerm = '';
  TaxChart._sectorFilter = '';
  TaxChart.updateCheckboxList();
};

// Get the list of items (companies or sectors) filtered by the current search term
TaxChart.getVisibleItems = function() {
  var items;
  if (TaxChart.state.viewBy === 'companies') {
    items = TaxChart.state.metadata.companies.slice();
  } else {
    items = TaxChart.state.metadata.sectors.slice();
  }

  if (TaxChart._searchTerm) {
    var term = TaxChart._searchTerm;
    items = items.filter(function(item) {
      return item.toLowerCase().indexOf(term) !== -1;
    });
  }
  return items;
};

// Rebuild the checkbox list. Selected items are pinned to the top.
// Also syncs the select-all checkbox state.
TaxChart.updateCheckboxList = function() {
  var listEl = document.getElementById('taxchart-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  var items = TaxChart.getVisibleItems();

  // Pin selected items to top
  var selected = TaxChart.state.selected;
  var selectedItems = items.filter(function(item) { return !!selected[item]; });
  var unselectedItems = items.filter(function(item) { return !selected[item]; });
  items = selectedItems.concat(unselectedItems);

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
      // Update header without rebuilding the list (avoids reordering mid-click)
      if (TaxChart._updateCompaniesHeader) TaxChart._updateCompaniesHeader();
      TaxChart.updateChart();
    });

    var swatch = document.createElement('span');
    swatch.className = 'taxchart-swatch';
    var sector = TaxChart.state.viewBy === 'companies'
      ? TaxChart.state.metadata.companySectorMap[item]
      : item;
    swatch.style.backgroundColor = TaxChart.state.metadata.sectorColorMap[sector] || '#999';

    label.appendChild(cb);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(' ' + item));
    label.addEventListener('mouseenter', (function(name) {
      return function() { TaxChart.highlightCompany(name); };
    })(item));
    label.addEventListener('mouseleave', function() {
      TaxChart.highlightCompany(null);
    });
    listEl.appendChild(label);
  });

  // Update header checkbox and count
  if (TaxChart._updateCompaniesHeader) TaxChart._updateCompaniesHeader();
};

// Toggle a single sector and its companies
TaxChart.toggleSector = function(sector, checked) {
  if (checked) {
    TaxChart.state.selectedSectors[sector] = true;
    TaxChart.state.metadata.companies.forEach(function(c) {
      if (TaxChart.state.metadata.companySectorMap[c] === sector) {
        TaxChart.state.selected[c] = true;
      }
    });
  } else {
    delete TaxChart.state.selectedSectors[sector];
    TaxChart.state.metadata.companies.forEach(function(c) {
      if (TaxChart.state.metadata.companySectorMap[c] === sector) {
        delete TaxChart.state.selected[c];
      }
    });
  }
  TaxChart.state.highlightSector = null;
};

// Select all sectors and their companies (including companies without sector)
TaxChart.selectAllSectors = function() {
  TaxChart.state.metadata.sectors.forEach(function(s) {
    TaxChart.state.selectedSectors[s] = true;
  });
  TaxChart.state.metadata.companies.forEach(function(c) {
    TaxChart.state.selected[c] = true;
  });
  TaxChart.state.highlightSector = null;
};

// Clear all sectors and their companies
TaxChart.clearAllSectors = function() {
  TaxChart.state.selectedSectors = {};
  TaxChart.state.selected = {};
  TaxChart.state.highlightSector = null;
};

// Build a floating sector legend overlay on the chart area.
// Shows a collapsible list of sectors with checkboxes and colored swatches.
TaxChart.buildFloatingLegend = function() {
  var chartArea = TaxChart.elements.chartArea;
  chartArea.style.position = 'relative';

  // Remove existing legend if present
  var existing = chartArea.querySelector('.taxchart-legend');
  if (existing) existing.remove();

  var legend = document.createElement('div');
  legend.className = 'taxchart-legend';

  // Toggle header
  var toggle = document.createElement('div');
  toggle.className = 'taxchart-legend-toggle';
  toggle.textContent = '\u25BC Sectors';

  var content = document.createElement('div');

  toggle.addEventListener('click', function() {
    if (content.style.display === 'none') {
      content.style.display = '';
      toggle.textContent = '\u25BC Sectors';
    } else {
      content.style.display = 'none';
      toggle.textContent = '\u25B6 Sectors';
    }
  });

  legend.appendChild(toggle);

  // Button row: All / Clear
  var btnRow = document.createElement('div');
  btnRow.className = 'taxchart-legend-btnrow';

  var allBtn = document.createElement('button');
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', function() {
    TaxChart.selectAllSectors();
    TaxChart.syncSectorUI();
    TaxChart.updateCheckboxList();
    TaxChart.updateChart();
  });

  var clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', function() {
    TaxChart.clearAllSectors();
    TaxChart.syncSectorUI();
    TaxChart.updateCheckboxList();
    TaxChart.updateChart();
  });

  btnRow.appendChild(allBtn);
  btnRow.appendChild(clearBtn);
  content.appendChild(btnRow);

  // Sector items with checkboxes
  var legendCheckboxes = {};

  TaxChart.state.metadata.sectors.forEach(function(s) {
    var item = document.createElement('label');
    item.className = 'taxchart-legend-item';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!TaxChart.state.selectedSectors[s];
    legendCheckboxes[s] = cb;

    cb.addEventListener('change', function() {
      TaxChart.toggleSector(s, this.checked);
      TaxChart.syncSectorUI();
      TaxChart.updateCheckboxList();
      TaxChart.updateChart();
    });

    var swatch = document.createElement('span');
    swatch.className = 'taxchart-swatch';
    swatch.style.backgroundColor = TaxChart.state.metadata.sectorColorMap[s] || '#999';

    item.appendChild(cb);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(' ' + s));
    content.appendChild(item);
  });

  legend.appendChild(content);
  chartArea.appendChild(legend);

  // Store update function for syncing checkbox states from external changes
  TaxChart._updateFloatingLegend = function() {
    TaxChart.state.metadata.sectors.forEach(function(s) {
      if (legendCheckboxes[s]) {
        legendCheckboxes[s].checked = !!TaxChart.state.selectedSectors[s];
      }
    });
  };
};

// Update all sector UI elements (floating legend, collapsible panel, dropdown).
// Called after any sector selection change to keep all UIs in sync.
TaxChart.syncSectorUI = function() {
  if (TaxChart._updateSectorDropdown) TaxChart._updateSectorDropdown();
  if (TaxChart._updateFloatingLegend) TaxChart._updateFloatingLegend();
  if (TaxChart._updateCollapsiblePanel) TaxChart._updateCollapsiblePanel();
};
