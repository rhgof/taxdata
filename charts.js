window.TaxChart = window.TaxChart || {};

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

TaxChart.buildFullTooltip = function(row) {
  var parts = [row['Company']];
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

TaxChart.formatValue = function(val, field) {
  if (val === null || val === undefined) return 'N/A';
  if (field === 'Tax Rate' || field === 'Taxable Income Margin' || field === 'Tax Revenue Rate') return (val * 100).toFixed(1) + '%';
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
      text: [TaxChart.buildFullTooltip(row)],
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
  var latestYear = years[years.length - 1];
  var traces = [];

  selectedNames.forEach(function(name) {
    var companyRows = rows.filter(function(r) {
      return r['Company'] === name;
    });
    companyRows.sort(function(a, b) {
      return years.indexOf(a['Financial Year']) - years.indexOf(b['Financial Year']);
    });

    var x = [], y = [], texts = [], symbols = [], sizes = [];
    companyRows.forEach(function(row) {
      if (row[pair.x] === null || row[pair.y] === null) return;
      x.push(row[pair.x]);
      y.push(row[pair.y]);
      texts.push(TaxChart.buildFullTooltip(row));
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
      mode: 'lines+markers',
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
      hovertext: [TaxChart.buildFullTooltip(item.row)],
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
      layout.xaxis = { title: '', categoryorder: 'trace', tickangle: -45 };
      layout.yaxis = {
        title: metric.label,
        type: TaxChart.state.logScaleY ? 'log' : 'linear',
        range: TaxChart.getAxisRange(metric.field, TaxChart.state.logScaleY)
      };
    } else {
      layout.xaxis = { title: 'Financial Year' };
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
