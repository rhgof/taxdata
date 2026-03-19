/**
 * charts.js — Plotly chart rendering for TaxChart.
 *
 * Responsibilities:
 *   - Build Plotly traces for each chart mode (scatter, trails, bar, line)
 *   - Construct layout with axes, log scale, fixed ranges, and annotations
 *   - Handle sector highlighting (opacity via restyle, no full redraw)
 *   - Sector drill-down: click a sector to switch to its companies
 */
window.TaxChart = window.TaxChart || {};

// Main entry point: rebuild the chart based on current state
TaxChart.updateChart = function() {
  var el = document.getElementById('taxchart-plot');
  if (!el) return;

  var selectedNames = Object.keys(TaxChart.state.selected);
  var mode = TaxChart.state.mode;
  var traces = [];

  if (selectedNames.length > 0) {
    if (mode === 'scatter') {
      traces = TaxChart.buildScatterTraces();
    } else if (mode === 'trails') {
      traces = TaxChart.buildTrailsTraces();
    } else if (mode === 'bar') {
      traces = TaxChart.buildBarTraces();
    } else if (mode === 'line') {
      traces = TaxChart.buildLineTraces();
    }
    if (!traces) traces = [];
  }

  var layout = TaxChart.buildLayout();
  Plotly.newPlot(el, traces, layout, { responsive: true });

  // Attach drill-down click handler for sector view
  if (TaxChart.state.viewBy === 'sectors' && (mode === 'scatter' || mode === 'bar')) {
    el.on('plotly_click', TaxChart.handleDrillDown);
  }

  // Attach click-to-toggle label handler for company scatter/trails modes
  if (TaxChart.state.viewBy !== 'sectors' && (mode === 'scatter' || mode === 'trails')) {
    el.on('plotly_click', function(eventData) {
      if (!eventData || !eventData.points || !eventData.points[0]) return;
      var name = eventData.points[0].data.name;
      if (!name) return;
      if (TaxChart.state.pinnedLabels[name]) {
        delete TaxChart.state.pinnedLabels[name];
      } else {
        TaxChart.state.pinnedLabels[name] = true;
      }
      TaxChart.updateChart();
    });
  }
};

// Return company-level or sector-aggregated rows depending on current view
TaxChart.getActiveRows = function() {
  if (TaxChart.state.viewBy === 'sectors') {
    return TaxChart.state.sectorRows;
  }
  return TaxChart.state.rows;
};

// Look up the sector color for a company or sector name
TaxChart.getColor = function(name) {
  var sector;
  if (TaxChart.state.viewBy === 'sectors') {
    sector = name;
  } else {
    sector = TaxChart.state.metadata.companySectorMap[name];
  }
  return TaxChart.state.metadata.sectorColorMap[sector] || '#999';
};

// Dim non-highlighted sectors to 15% opacity when a sector is highlighted
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

// Build an HTML tooltip showing all metrics for a data point
TaxChart.buildFullTooltip = function(row) {
  var parts = [row['Company']];
  if (row['ASX Code']) {
    parts.push('ASX: ' + row['ASX Code']);
  }
  if (row['Sector'] && row['Company'] !== row['Sector']) {
    parts.push('Sector: ' + row['Sector']);
  }
  if (row['Country of Ultimate Owner']) {
    parts.push('Country: ' + row['Country of Ultimate Owner']);
  }
  parts.push('Total Income (Revenue): ' + TaxChart.formatValue(row['Total Income'], 'Total Income'));
  parts.push('Taxable Income: ' + TaxChart.formatValue(row['Taxable Income'], 'Taxable Income'));
  parts.push('Tax Payable: ' + TaxChart.formatValue(row['Tax Payable'], 'Tax Payable'));
  parts.push('Tax Rate: ' + TaxChart.formatValue(row['Tax Rate'], 'Tax Rate'));
  parts.push('Taxable Income Margin: ' + TaxChart.formatValue(row['Taxable Income Margin'], 'Taxable Income Margin'));
  parts.push('Tax Revenue Rate: ' + TaxChart.formatValue(row['Tax Revenue Rate'], 'Tax Revenue Rate'));
  parts.push('Year: ' + row['Financial Year']);
  return parts.join('<br>');
};

TaxChart.buildTooltip = function(row, xField, yField) {
  return TaxChart.buildFullTooltip(row);
};

// Format a value for display: percentages for ratios, $B/$M/$K for dollar amounts
TaxChart.formatValue = function(val, field) {
  if (val === null || val === undefined) return 'N/A';
  if (field === 'Tax Rate' || field === 'Taxable Income Margin' || field === 'Tax Revenue Rate') return (val * 100).toFixed(1) + '%';
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return '$' + (val / 1e3).toFixed(0) + 'K';
  return '$' + val.toFixed(0);
};

// Scatter mode: one marker per selected entity for the chosen year and axis pair.
// Auto-labels top 5 entities by y-value and any pinned labels.
TaxChart.buildScatterTraces = function() {
  var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
  var year = TaxChart.state.metadata.years[TaxChart.state.yearIndex];
  var rows = TaxChart.getActiveRows();
  var selectedNames = Object.keys(TaxChart.state.selected);

  // Collect all valid items
  var items = [];
  selectedNames.forEach(function(name) {
    var filtered = rows.filter(function(r) {
      return r['Company'] === name && r['Financial Year'] === year;
    });
    if (filtered.length === 0) return;
    var row = filtered[0];
    if (row[pair.x] === null || row[pair.y] === null) return;
    items.push({ name: name, xVal: row[pair.x], yVal: row[pair.y], row: row });
  });

  // Determine top 5 by y-value
  var sorted = items.slice().sort(function(a, b) { return b.yVal - a.yVal; });
  var topNames = {};
  for (var i = 0; i < Math.min(5, sorted.length); i++) {
    topNames[sorted[i].name] = true;
  }

  // Build traces
  var traces = [];
  items.forEach(function(item) {
    var shouldLabel = !!TaxChart.state.pinnedLabels[item.name] || !!topNames[item.name];
    traces.push({
      x: [item.xVal],
      y: [item.yVal],
      mode: 'markers+text',
      type: 'scatter',
      name: item.name,
      marker: {
        color: TaxChart.getColor(item.name),
        size: 10,
        opacity: TaxChart.getOpacity(item.name)
      },
      text: [shouldLabel ? item.name : ''],
      textposition: 'top center',
      textfont: { size: 10 },
      hovertext: [TaxChart.buildFullTooltip(item.row)],
      hoverinfo: 'text'
    });
  });

  return traces;
};

// Trails mode: lines+markers across all years per entity.
// Latest year = filled circle, prior years = open circles.
// Auto-labels top 5 entities by latest-year y-value and any pinned labels.
TaxChart.buildTrailsTraces = function() {
  var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
  var rows = TaxChart.getActiveRows();
  var selectedNames = Object.keys(TaxChart.state.selected);
  var years = TaxChart.state.metadata.years;
  var latestYear = years[years.length - 1];

  // Collect latest-year y-values to determine top 5
  var latestYValues = [];
  selectedNames.forEach(function(name) {
    var latestRow = rows.filter(function(r) {
      return r['Company'] === name && r['Financial Year'] === latestYear;
    });
    if (latestRow.length > 0 && latestRow[0][pair.y] !== null) {
      latestYValues.push({ name: name, yVal: latestRow[0][pair.y] });
    }
  });
  latestYValues.sort(function(a, b) { return b.yVal - a.yVal; });
  var topNames = {};
  for (var i = 0; i < Math.min(5, latestYValues.length); i++) {
    topNames[latestYValues[i].name] = true;
  }

  var traces = [];
  selectedNames.forEach(function(name) {
    var companyRows = rows.filter(function(r) {
      return r['Company'] === name;
    });
    companyRows.sort(function(a, b) {
      return years.indexOf(a['Financial Year']) - years.indexOf(b['Financial Year']);
    });

    var x = [], y = [], hoverTexts = [], labelTexts = [], symbols = [], sizes = [];
    var shouldLabel = !!TaxChart.state.pinnedLabels[name] || !!topNames[name];
    companyRows.forEach(function(row) {
      if (row[pair.x] === null || row[pair.y] === null) return;
      x.push(row[pair.x]);
      y.push(row[pair.y]);
      hoverTexts.push(TaxChart.buildFullTooltip(row));
      // Only label the latest-year point
      if (row['Financial Year'] === latestYear && shouldLabel) {
        labelTexts.push(name);
      } else {
        labelTexts.push('');
      }
      // Filled circle for latest year, open circle for prior
      if (row['Financial Year'] === latestYear) {
        symbols.push('circle');
        sizes.push(10);
      } else {
        symbols.push('circle-open');
        sizes.push(8);
      }
    });

    if (x.length === 0) return;

    traces.push({
      x: x,
      y: y,
      mode: 'lines+markers+text',
      type: 'scatter',
      name: name,
      line: { color: TaxChart.getColor(name) },
      marker: {
        color: TaxChart.getColor(name),
        size: sizes,
        symbol: symbols,
        line: { color: TaxChart.getColor(name), width: 2 }
      },
      opacity: TaxChart.getOpacity(name),
      text: labelTexts,
      textposition: 'top center',
      textfont: { size: 10 },
      hovertext: hoverTexts,
      hoverinfo: 'text'
    });
  });

  return traces;
};

// Bar mode: one bar per entity for a single metric and year.
// One trace per entity so each gets its own sector color.
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
    var sortField = TaxChart.state.sortField;
    items.sort(function(a, b) {
      var aVal = a.row[sortField] !== null && a.row[sortField] !== undefined ? a.row[sortField] : -Infinity;
      var bVal = b.row[sortField] !== null && b.row[sortField] !== undefined ? b.row[sortField] : -Infinity;
      return bVal - aVal;
    });
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
      hovertext: [TaxChart.buildFullTooltip(item.row)],
      hoverinfo: 'text',
      textposition: 'none'
    });
  });

  return traces;
};

// Line mode: one line per entity showing a single metric across all years
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
      texts.push(TaxChart.buildFullTooltip(row));
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

// Compute axis range with 5% padding. Uses separate min/max for company vs sector view.
// For log scale, pads in log-space so the padding is proportional.
TaxChart.getAxisRange = function(field, isLog) {
  var ranges = TaxChart.state.viewBy === 'sectors'
    ? TaxChart.state.axisRangesSectors
    : TaxChart.state.axisRangesCompanies;
  var r = ranges ? ranges[field] : null;
  if (!r) return undefined;
  if (isLog) {
    var logMin = r.min > 0 ? Math.log10(r.min) : 0;
    var logMax = r.max > 0 ? Math.log10(r.max) : 1;
    var pad = (logMax - logMin) * 0.05;
    return [logMin - pad, logMax + pad];
  }
  var pad = (r.max - r.min) * 0.05;
  return [Math.max(0, r.min - pad), r.max + pad];
};

// Build the Plotly layout: axes, tick formatting, log scale, and source annotation
TaxChart.buildLayout = function() {
  var mode = TaxChart.state.mode;
  var now = new Date();
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dateStr = now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

  var layout = {
    margin: { t: 30, r: 30, b: (mode === 'bar' ? 150 : 50), l: 70 },
    showlegend: false,
    hovermode: 'closest',
    hoverlabel: { bgcolor: 'rgba(255,255,255,0.85)', bordercolor: '#ccc', font: { color: '#333' } },
    annotations: [{
      text: 'Source: @deadinlongrun.bsky.social ' + dateStr,
      xref: 'paper', yref: 'paper',
      x: 1,
      y: (mode === 'bar' || mode === 'line') ? 1 : 0,
      xanchor: 'right',
      yanchor: (mode === 'bar' || mode === 'line') ? 'top' : 'bottom',
      showarrow: false,
      font: { size: 10, color: '#bbb' }
    }]
  };

  if (mode === 'scatter' || mode === 'trails') {
    var pair = TaxChart.AXIS_PAIRS[TaxChart.state.axisPairIndex];
    var labels = TaxChart.FIELD_LABELS;
    layout.xaxis = {
      title: labels[pair.x] || pair.x,
      type: TaxChart.state.logScaleX ? 'log' : 'linear',
      range: TaxChart.getAxisRange(pair.x, TaxChart.state.logScaleX)
    };
    layout.yaxis = {
      title: labels[pair.y] || pair.y,
      type: TaxChart.state.logScaleY ? 'log' : 'linear',
      range: TaxChart.getAxisRange(pair.y, TaxChart.state.logScaleY)
    };
    // Log scale: gridlines on powers of 10
    if (TaxChart.state.logScaleX) layout.xaxis.dtick = 1;
    if (TaxChart.state.logScaleY) layout.yaxis.dtick = 1;
    if (['Tax Rate', 'Taxable Income Margin', 'Tax Revenue Rate'].indexOf(pair.x) !== -1) layout.xaxis.tickformat = '.0%';
    if (['Tax Rate', 'Taxable Income Margin', 'Tax Revenue Rate'].indexOf(pair.y) !== -1) layout.yaxis.tickformat = '.0%';
  } else {
    var metric = TaxChart.SINGLE_METRICS[TaxChart.state.metricIndex];
    if (mode === 'bar') {
      layout.xaxis = { title: '', categoryorder: 'trace', tickangle: -90, tickfont: { size: 10 } };
      layout.yaxis = {
        title: metric.label,
        type: TaxChart.state.logScaleY ? 'log' : 'linear',
        range: TaxChart.getAxisRange(metric.field, TaxChart.state.logScaleY)
      };
    } else {
      layout.xaxis = { title: 'Financial Year', type: 'category', categoryorder: 'array', categoryarray: TaxChart.state.metadata.years };
      layout.yaxis = {
        title: metric.label,
        type: TaxChart.state.logScaleY ? 'log' : 'linear',
        range: TaxChart.getAxisRange(metric.field, TaxChart.state.logScaleY)
      };
    }
    if (TaxChart.state.logScaleY) layout.yaxis.dtick = 1;
    if (['Tax Rate', 'Taxable Income Margin', 'Tax Revenue Rate'].indexOf(metric.field) !== -1) layout.yaxis.tickformat = '.0%';
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

  // Switch to companies view, select companies in this sector
  TaxChart.state.viewBy = 'companies';
  TaxChart.state.selected = {};
  TaxChart.state.selectedSectors = {};
  TaxChart.state.selectedSectors[sectorName] = true;
  TaxChart.state.highlightSector = null;

  var companiesInSector = TaxChart.state.metadata.companies.filter(function(c) {
    return TaxChart.state.metadata.companySectorMap[c] === sectorName;
  });
  companiesInSector.forEach(function(c) {
    TaxChart.state.selected[c] = true;
  });

  TaxChart._sectorFilter = '';
  TaxChart.buildSidePanel();
  TaxChart.updateCheckboxList();
  TaxChart.updateChart();
};
