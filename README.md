# Corporate Tax Data Explorer

An interactive browser-based chart app for exploring Australian corporate tax transparency data.

## Live demo

[**Open the interactive chart**](https://rhgof.github.io/taxdata/)

## Running locally

The app uses `fetch()` to load CSV data, so it must be served over HTTP (not opened directly as a file).

Start a local server from the project directory:

```sh
python3 -m http.server
```

Then open http://localhost:8000 in your browser.

Alternatively, any static file server works — for example:

```sh
# Node.js
npx serve .

# PHP
php -S localhost:8000
```

## Overview

- **Tech:** Plain HTML, CSS, and JavaScript with Plotly.js (loaded via CDN). No build step required.
- **Data:** CSV loaded from the URL specified in the `data-csv-url` attribute on the chart element.
- **Chart modes:** Scatter, Scatter with Trails, Bar, Line.
- **Controls:** Side panel with company/sector selection, year slider, axis pair presets, and sort options.
