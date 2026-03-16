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
  yearIndex: 0,
  viewBy: 'companies',
  selected: {},
  highlightSector: null,
  sortDescending: false,
  rows: [],
  sectorRows: [],
  metadata: null
};

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
      TaxChart.renderApp();
    })
    .catch(function(err) {
      container.innerHTML = '<p class="taxchart-error">Unable to load data: ' + err.message + '</p>';
    });
};

TaxChart.renderApp = function() {
  var container = TaxChart.container;
  container.innerHTML = '';

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
};

TaxChart.buildBottomPanel = function() {
  var panel = TaxChart.elements.bottomPanel;
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
      TaxChart.state.highlightSector = null;
      TaxChart.buildBottomPanel();
      TaxChart.updateChart();
    });
    toggleRow.appendChild(btn);
  });
  panel.appendChild(toggleRow);

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

  var listContainer = document.createElement('div');
  listContainer.className = 'taxchart-list';
  listContainer.id = 'taxchart-list';
  panel.appendChild(listContainer);

  TaxChart._searchTerm = '';
  // Preserve _sectorFilter if set by drill-down; otherwise reset
  if (!TaxChart._preserveSectorFilter) {
    TaxChart._sectorFilter = '';
  }
  TaxChart._preserveSectorFilter = false;
  TaxChart.updateCheckboxList();
};

TaxChart.updateCheckboxList = function() {
  var listEl = document.getElementById('taxchart-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  var items;
  if (TaxChart.state.viewBy === 'companies') {
    items = TaxChart.state.metadata.companies;
    if (TaxChart._sectorFilter) {
      items = items.filter(function(c) {
        return TaxChart.state.metadata.companySectorMap[c] === TaxChart._sectorFilter;
      });
    }
  } else {
    items = TaxChart.state.metadata.sectors;
  }

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
