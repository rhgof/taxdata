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
