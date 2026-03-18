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
  { label: 'Taxable Income vs Tax Rate', x: 'Taxable Income', y: 'Tax Rate' }
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

TaxChart.MODES = ['scatter', 'trails', 'bar', 'line'];

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
  logScaleX: false,
  logScaleY: false,
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
      TaxChart.state.rows = rows;
      TaxChart.state.metadata = TaxChart.buildMetadata(rows);
      TaxChart.state.sectorRows = TaxChart.aggregateBySector(rows);
      TaxChart.state.yearIndex = TaxChart.state.metadata.years.length - 1;
      // Select all companies and sectors by default
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

// Build the app shell: top control bar + main area (chart + side panel)
TaxChart.renderApp = function() {
  var container = TaxChart.container;
  container.innerHTML = '';

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

  container.appendChild(topBar);
  container.appendChild(mainArea);

  TaxChart.elements = {
    topBar: topBar,
    chartArea: chartArea,
    sidePanel: sidePanel
  };

  TaxChart.buildTopControls();
  TaxChart.buildSidePanel();
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

  // Year slider
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

  // Log scale toggles
  var logGroup = document.createElement('div');
  logGroup.className = 'taxchart-control-group';

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

  logGroup.appendChild(logXLabel);
  logGroup.appendChild(logYLabel);
  bar.appendChild(logGroup);
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

  if (TaxChart.state.viewBy === 'companies') {
    var filterRow = document.createElement('div');
    filterRow.className = 'taxchart-filter-row';

    var filterLabel = document.createElement('span');
    filterLabel.className = 'taxchart-label';
    filterLabel.textContent = 'Sectors:';
    filterRow.appendChild(filterLabel);

    // Custom multi-select sector dropdown
    var dropdownWrapper = document.createElement('div');
    dropdownWrapper.className = 'taxchart-sector-dropdown';

    var dropdownBtn = document.createElement('button');
    dropdownBtn.className = 'taxchart-sector-dropdown-btn';

    function updateDropdownLabel() {
      var count = Object.keys(TaxChart.state.selectedSectors).length;
      var total = TaxChart.state.metadata.sectors.length;
      if (count === total) {
        dropdownBtn.textContent = 'All sectors';
      } else if (count === 0) {
        dropdownBtn.textContent = 'No sectors';
      } else {
        dropdownBtn.textContent = count + ' of ' + total + ' sector' + (count > 1 ? 's' : '');
      }
    }
    updateDropdownLabel();
    dropdownWrapper.appendChild(dropdownBtn);

    var dropdownList = document.createElement('div');
    dropdownList.className = 'taxchart-sector-dropdown-list';
    dropdownList.style.display = 'none';

    // Check All / Clear All buttons at top of dropdown
    var btnRow = document.createElement('div');
    btnRow.className = 'taxchart-sector-dropdown-btnrow';

    var checkAllBtn = document.createElement('button');
    checkAllBtn.className = 'taxchart-mode-btn';
    checkAllBtn.textContent = 'Check all';
    checkAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      TaxChart.selectAllSectors();
      updateDropdownLabel();
      updateSectorCheckboxes();
      TaxChart.updateCheckboxList();
      TaxChart.updateChart();
    });

    var clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'taxchart-mode-btn';
    clearAllBtn.textContent = 'Clear all';
    clearAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      TaxChart.clearAllSectors();
      updateDropdownLabel();
      updateSectorCheckboxes();
      TaxChart.updateCheckboxList();
      TaxChart.updateChart();
    });

    btnRow.appendChild(checkAllBtn);
    btnRow.appendChild(clearAllBtn);
    dropdownList.appendChild(btnRow);

    // Store references to sector checkboxes for updating
    var sectorCheckboxes = {};

    TaxChart.state.metadata.sectors.forEach(function(s) {
      var item = document.createElement('label');
      item.className = 'taxchart-sector-dropdown-item';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!TaxChart.state.selectedSectors[s];
      sectorCheckboxes[s] = cb;

      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        TaxChart.toggleSector(s, this.checked);
        updateDropdownLabel();
        TaxChart.updateCheckboxList();
        TaxChart.updateChart();
      });

      var swatch = document.createElement('span');
      swatch.className = 'taxchart-swatch';
      swatch.style.backgroundColor = TaxChart.state.metadata.sectorColorMap[s] || '#999';

      item.appendChild(cb);
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(' ' + s));
      dropdownList.appendChild(item);
    });

    function updateSectorCheckboxes() {
      TaxChart.state.metadata.sectors.forEach(function(s) {
        if (sectorCheckboxes[s]) {
          sectorCheckboxes[s].checked = !!TaxChart.state.selectedSectors[s];
        }
      });
    }

    // Store reference for external updates
    TaxChart._updateSectorDropdown = function() {
      updateDropdownLabel();
      updateSectorCheckboxes();
    };

    dropdownWrapper.appendChild(dropdownList);

    dropdownBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = dropdownList.style.display !== 'none';
      dropdownList.style.display = isOpen ? 'none' : 'block';
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
      if (!dropdownWrapper.contains(e.target)) {
        dropdownList.style.display = 'none';
      }
    });

    filterRow.appendChild(dropdownWrapper);
    panel.appendChild(filterRow);
  }

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

  var selectAllLabel = document.createElement('label');
  selectAllLabel.className = 'taxchart-label';
  selectAllLabel.style.whiteSpace = 'nowrap';
  var selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.id = 'taxchart-select-all';
  var visibleItems = TaxChart.getVisibleItems();
  var allSelected = visibleItems.length > 0 && visibleItems.every(function(item) {
    return !!TaxChart.state.selected[item];
  });
  selectAllCb.checked = allSelected;
  selectAllCb.addEventListener('change', function() {
    if (TaxChart.state.viewBy === 'companies') {
      // Sync with sector dropdown
      if (this.checked) {
        TaxChart.selectAllSectors();
      } else {
        TaxChart.clearAllSectors();
      }
      if (TaxChart._updateSectorDropdown) TaxChart._updateSectorDropdown();
    } else {
      // Sectors view — just toggle all visible items
      var items = TaxChart.getVisibleItems();
      if (this.checked) {
        items.forEach(function(item) {
          TaxChart.state.selected[item] = true;
        });
      } else {
        items.forEach(function(item) {
          delete TaxChart.state.selected[item];
        });
      }
    }
    TaxChart.updateCheckboxList();
    TaxChart.updateChart();
  });
  selectAllLabel.appendChild(selectAllCb);
  selectAllLabel.appendChild(document.createTextNode(' Select all'));

  searchRow.appendChild(searchInput);
  searchRow.appendChild(selectAllLabel);
  panel.appendChild(searchRow);

  var listContainer = document.createElement('div');
  listContainer.className = 'taxchart-list';
  listContainer.id = 'taxchart-list';
  panel.appendChild(listContainer);

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
      TaxChart.updateCheckboxList();
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
    listEl.appendChild(label);
  });

  // Update select-all checkbox state
  var selectAllCb = document.getElementById('taxchart-select-all');
  if (selectAllCb) {
    var visibleItems = TaxChart.getVisibleItems();
    selectAllCb.checked = visibleItems.length > 0 && visibleItems.every(function(item) {
      return !!TaxChart.state.selected[item];
    });
  }
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

// Select all sectors and their companies
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
