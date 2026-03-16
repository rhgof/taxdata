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
  TaxChart.elements.topBar.innerHTML = '<p>Controls will go here</p>';
};

TaxChart.buildBottomPanel = function() {
  TaxChart.elements.bottomPanel.innerHTML = '<p>Selection panel will go here</p>';
};
