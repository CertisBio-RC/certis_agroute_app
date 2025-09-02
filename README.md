# certis_agroute_app — GitHub Pages (Mapbox Option A)

Static Next.js site with Mapbox GL JS, deployable to **GitHub Pages**.
- Loads GeoJSON from `public/data/retailers.geojson`
- Calls **Mapbox Optimization API** directly from the browser (no backend)
- Base path preset to `/certis_agroute_app`

## Quick Start (Local)
1. `npm i`
2. Copy `.env.example` → `.env.local` and set:
   - `NEXT_PUBLIC_MAPBOX_TOKEN=pk...` (restrict to your Pages domain in Mapbox)
   - `NEXT_PUBLIC_REPO_NAME=certis_agroute_app` (already defaulted)
3. `npm run dev` → http://localhost:3000

## Deploy to GitHub Pages
1. Create a GitHub repo named **certis_agroute_app** and push this code.
2. Add **Repository secrets** (Settings → Secrets → Actions):
   - `MAPBOX_PUBLIC_TOKEN` = your `pk_...` token
   - `REPO_NAME` = `certis_agroute_app` (optional; default is already set)
3. **Settings → Pages** → set “Build and deployment” to **GitHub Actions**.
4. Push to `main` — the workflow deploys to:
   `https://<username>.github.io/certis_agroute_app/`

## Replace Demo Data
- Put your combined or per-retailer GeoJSON into `public/data/retailers.geojson`

## Draw Optimized Route
This starter calls Mapbox Optimization and logs the result.
To draw the line:
- Read `data.trips[0].geometry` (polyline)
- Add a GeoJSON `LineString` source + `line` layer in `components/Map.tsx`

## Token Security
In your Mapbox account: **Tokens → Create token → URL restrictions**
- Allow origins: `https://<username>.github.io`, `https://<username>.github.io/certis_agroute_app`
