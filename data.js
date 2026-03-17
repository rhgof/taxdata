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

TaxChart.DERIVED_FIELDS = [
  {
    name: 'Tax Rate',
    compute: function(row) {
      if (row['Tax Payable'] === null || row['Taxable Income'] === null || row['Taxable Income'] === 0) {
        return null;
      }
      return row['Tax Payable'] / row['Taxable Income'];
    }
  },
  {
    name: 'Taxable Income Margin',
    compute: function(row) {
      if (row['Taxable Income'] === null || row['Total Income'] === null || row['Total Income'] === 0) {
        return null;
      }
      return row['Taxable Income'] / row['Total Income'];
    }
  },
  {
    name: 'Tax Revenue Rate',
    compute: function(row) {
      if (row['Tax Payable'] === null || row['Total Income'] === null || row['Total Income'] === 0) {
        return null;
      }
      return row['Tax Payable'] / row['Total Income'];
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

TaxChart.aggregateBySector = function(rows) {
  var groups = {};

  rows.forEach(function(row) {
    var key = row['Sector'] + '||' + row['Financial Year'];
    if (!groups[key]) {
      groups[key] = {
        'Company': row['Sector'],
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

  TaxChart.computeDerived(result);
  return result;
};

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
