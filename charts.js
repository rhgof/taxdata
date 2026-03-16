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

TaxChart.applyHighlight = function() {
  // Will be replaced with Plotly.restyle implementation in Task 7
  TaxChart.updateChart();
};
