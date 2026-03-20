/**
 * data.js — Data loading, parsing, and transformation for TaxChart.
 *
 * Responsibilities:
 *   - Fetch and parse CSV data (with quoted-field support)
 *   - Compute derived metrics (Tax Rate, Taxable Income Margin, Tax Revenue Rate)
 *   - Aggregate company rows into sector-level summaries
 *   - Build metadata (unique sectors, companies, years, color map)
 */
window.TaxChart = window.TaxChart || {};

// Fields that should be parsed as numbers (nulls preserved for missing/blank values)
TaxChart.NUMERIC_FIELDS = ['Total Income', 'Taxable Income', 'Tax Payable'];

// Fields that should be parsed as booleans (TRUE → true, else false)
TaxChart.BOOLEAN_FIELDS = ['ASX Listed'];

// Fetch CSV from URL and return parsed rows
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

// Parse CSV text into an array of row objects.
// Numeric fields are converted to Number or null; all others remain strings.
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
      } else if (TaxChart.BOOLEAN_FIELDS.indexOf(headers[j]) !== -1) {
        row[headers[j]] = val === 'TRUE';
      } else {
        row[headers[j]] = val;
      }
    }
    if (!row['Sector']) row['Sector'] = 'Unclassified';
    rows.push(row);
  }
  return rows;
};

// Split a single CSV line respecting quoted fields (handles commas inside quotes)
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

// Derived metrics computed from raw ATO fields.
// Each returns a ratio (displayed as percentage) or null if inputs are missing/zero.
//   Tax Rate             = Tax Payable / Taxable Income
//   Taxable Income Margin = Taxable Income / Total Income
//   Tax Revenue Rate      = Tax Payable / Total Income
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

// Add derived fields to each row in-place
TaxChart.computeDerived = function(rows) {
  rows.forEach(function(row) {
    TaxChart.DERIVED_FIELDS.forEach(function(field) {
      row[field.name] = field.compute(row);
    });
  });
  return rows;
};

// Aggregate company-level rows into sector totals, grouped by sector + financial year.
// Tracks whether any non-null Taxable Income / Tax Payable existed to avoid
// reporting zero when the real value is unknown (ATO suppression rules).
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

// D3 category20-style palette for sector colors (wraps if >20 sectors)
TaxChart.SECTOR_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
  '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5'
];

// Extract sorted unique sectors, companies, and years from the data.
// Builds sector→color and company→sector lookup maps.
TaxChart.buildMetadata = function(rows) {
  var sectors = [];
  var companies = [];
  var years = [];
  var companySectorMap = {};

  rows.forEach(function(row) {
    var sector = row['Sector'];
    if (sector && sectors.indexOf(sector) === -1) sectors.push(sector);
    if (companies.indexOf(row['Company']) === -1) companies.push(row['Company']);
    if (years.indexOf(row['Financial Year']) === -1) years.push(row['Financial Year']);
    companySectorMap[row['Company']] = sector;
  });

  sectors.sort(function(a, b) {
    if (a === 'Unclassified') return 1;
    if (b === 'Unclassified') return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  companies.sort();
  years.sort();

  var sectorColorMap = {};
  var colorIdx = 0;
  sectors.forEach(function(s) {
    if (s === 'Unclassified') {
      sectorColorMap[s] = '#999999';
    } else {
      sectorColorMap[s] = TaxChart.SECTOR_COLORS[colorIdx % TaxChart.SECTOR_COLORS.length];
      colorIdx++;
    }
  });

  return {
    sectors: sectors,
    companies: companies,
    years: years,
    sectorColorMap: sectorColorMap,
    companySectorMap: companySectorMap
  };
};
