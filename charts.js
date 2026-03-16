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
      hovertext: [item.name + '<br>' + metric.label + ': ' + TaxChart.formatValue(item.value, metric.field)],
      hoverinfo: 'text',
      textposition: 'none'
    });
  });

  return traces;
};

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

TaxChart.buildLayout = function() {
  var mode = TaxChart.state.mode;
  var layout = {
    margin: { t: 30, r: 30, b: 50, l: 70 },
    showlegend: false,
    hovermode: 'closest'
  };

  if (mode === 'scatter' || mode === 'trails') {
    var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
    layout.xaxis = { title: pair.x };
    layout.yaxis = { title: pair.y };
    if (pair.x === 'Tax Rate') layout.xaxis.tickformat = '.0%';
    if (pair.y === 'Tax Rate') layout.yaxis.tickformat = '.0%';
  } else {
    var metric = TaxChart.SINGLE_METRICS[TaxChart.state.metricIndex];
    if (mode === 'bar') {
      layout.xaxis = { title: '', categoryorder: 'trace' };
      layout.yaxis = { title: metric.label };
    } else {
      layout.xaxis = { title: 'Financial Year' };
      layout.yaxis = { title: metric.label };
    }
    if (metric.field === 'Tax Rate') layout.yaxis.tickformat = '.0%';
  }

  return layout;
};

// Efficient highlight update using Plotly.restyle (no full redraw)
TaxChart.applyHighlight = function() {
  var el = document.getElementById('taxchart-plot');
  if (!el || !el.data || el.data.length === 0) return;

  var opacities = el.data.map(function(trace) {
    return TaxChart.getOpacity(trace.name);
  });

  var mode = TaxChart.state.mode;
  if (mode === 'bar') {
    // For bar traces, update marker.opacity per-trace
    for (var i = 0; i < el.data.length; i++) {
      Plotly.restyle(el, { 'marker.opacity': opacities[i] }, [i]);
    }
  } else {
    // For scatter/line traces, update trace-level opacity
    for (var j = 0; j < el.data.length; j++) {
      Plotly.restyle(el, { opacity: opacities[j] }, [j]);
    }
  }
};

// Sector drill-down handler
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
  TaxChart._preserveSectorFilter = true;
  TaxChart.buildSidePanel();

  // Now set the sector filter dropdown to match
  var sectorDropdown = TaxChart.elements.sidePanel.querySelector('.taxchart-select');
  if (sectorDropdown) sectorDropdown.value = sectorName;
  TaxChart.updateCheckboxList();
  TaxChart.updateChart();
};
