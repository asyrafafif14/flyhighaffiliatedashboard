# Flyhigh Affiliate Dashboard

Static Netlify dashboard generated from `Full LMS Report April.csv`.

## Safer data model

The raw CSV stays in the GitHub repository for build-time use. The deployed site only serves `data/dashboard.json`, which contains aggregated affiliate and product metrics. It does not include customer/student names, parent names, phone numbers, payment references, or transaction-level rows.

## Local build

```bash
npm --prefix affiliate-dashboard-web run build
npm --prefix affiliate-dashboard-web run start
```

Open `http://localhost:4173`.

## Netlify

Netlify uses `netlify.toml`:

- Build command: `npm --prefix affiliate-dashboard-web run build`
- Publish directory: `affiliate-dashboard-web/dist`

When the CSV changes, commit the updated `Full LMS Report April.csv` and Netlify will rebuild the sanitized dashboard JSON.
