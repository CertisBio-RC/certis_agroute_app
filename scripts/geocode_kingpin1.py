# ============================================================================
# geocode_kingpin1.py  —  FINAL (Option C Full Regeneration)
#
# Purpose:
#   • Read kingpin1_COMBINED.xlsx
#   • Geocode using Mapbox with smart fallback logic
#   • Preserve all contact metadata
#   • Export clean GeoJSON → public/data/kingpin1.geojson
#   • Log anomalies → data/kingpin1_anomalies.xlsx
#
# Bailey Rules:
#   • Never modify or overwrite Excel inputs
#   • Use mapbox_token.json (not env vars)
#   • Never delete rows
#   • Produce stable, deterministic output
# ============================================================================

import os
import json
import pandas as pd
import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(ROOT, "data")
PUBLIC_DIR = os.path.join(ROOT, "public", "data")

INPUT_FILE = os.path.join(DATA_DIR, "kingpin1_COMBINED.xlsx")
TOKEN_FILE = os.path.join(PUBLIC_DIR, "mapbox_token.json")
OUTPUT_JSON = os.path.join(PUBLIC_DIR, "kingpin1.geojson")
ANOMALY_LOG = os.path.join(DATA_DIR, "kingpin1_anomalies.xlsx")

# ---------------------------------------------------------------------------
# Load Mapbox Token
# ---------------------------------------------------------------------------
if not os.path.exists(TOKEN_FILE):
    raise RuntimeError(f"❌ Missing mapbox_token.json → {TOKEN_FILE}")

token_data = json.load(open(TOKEN_FILE, "r"))
MAPBOX_TOKEN = token_data.get("token")

if not MAPBOX_TOKEN:
    raise RuntimeError("❌ mapbox_token.json missing required `token` field.")

# ---------------------------------------------------------------------------
# State centroid fallback (approx)
# ---------------------------------------------------------------------------
STATE_CENTROIDS = {
    "IA": (42.0751, -93.4960),
    "MN": (46.3160, -94.2000),
    "NE": (41.5378, -99.7951),
    "SD": (44.2998, -99.4388),
    "ND": (47.5289, -99.7840),
    "IL": (40.0000, -89.0000),
    "WI": (44.5000, -89.5000),
    "MO": (38.4500, -92.3500),
    "IN": (39.9000, -86.3000),
    "KS": (38.5000, -98.0000),
}

# ---------------------------------------------------------------------------
# Mapbox geocoder
# ---------------------------------------------------------------------------
def geocode_query(query: str):
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"
    params = {"access_token": MAPBOX_TOKEN, "limit": 1}

    r = requests.get(url, params=params)
    data = r.json()

    if data.get("features"):
        lon, lat = data["features"][0]["center"]
        return lat, lon

    return None


# ---------------------------------------------------------------------------
# Read Excel
# ---------------------------------------------------------------------------
if not os.path.exists(INPUT_FILE):
    raise RuntimeError(f"❌ Missing input file: {INPUT_FILE}")

df = pd.read_excel(INPUT_FILE)

required_cols = ["ADDRESS", "CITY", "STATE", "ZIP CODE", "CONTACT NAME", "RETAILER"]
missing = [c for c in required_cols if c not in df.columns]

if missing:
    raise RuntimeError(f"❌ Missing required columns: {missing}")

# ---------------------------------------------------------------------------
# Process rows
# ---------------------------------------------------------------------------
geojson_features = []
anomalies = []

print(f"📄 Loaded {len(df)} Kingpin1 rows")

for idx, row in df.iterrows():
    name = row.get("CONTACT NAME", "")
    retailer = row.get("RETAILER", "")
    addr = row.get("ADDRESS", "")
    city = row.get("CITY", "")
    state = row.get("STATE", "")
    zipcode = row.get("ZIP CODE", "")
    title = row.get("TITLE", "")
    office = row.get("OFFICE PHONE", "")
    cell = row.get("S", "")
    email = row.get("EMAIL", "")

    # ---------------------------------------------------------------
    # Build geocode target in priority order
    # ---------------------------------------------------------------
    if pd.notna(addr) and str(addr).strip():
        query = f"{addr}, {city}, {state} {zipcode}"
    elif pd.notna(city) and str(city).strip():
        query = f"{city}, {state}"
    else:
        # State centroid fallback
        centroid = STATE_CENTROIDS.get(state)
        if centroid:
            lat, lon = centroid
            geojson_features.append({
                "type": "Feature",
                "properties": {
                    "Name": name,
                    "Retailer": retailer,
                    "Title": title,
                    "OfficePhone": office,
                    "CellPhone": cell,
                    "Email": email,
                    "Category": "Kingpin",
                },
                "geometry": {"type": "Point", "coordinates": [lon, lat]}
            })
            print(f"📍 State-centroid fallback → {name} ({state})")
            continue
        else:
            anomalies.append(row)
            print(f"⚠️ Unable to geocode row {idx}: no state centroid")
            continue

    # ---------------------------------------------------------------
    # Attempt geocoding
    # ---------------------------------------------------------------
    result = geocode_query(query)

    if result is None:
        anomalies.append(row)
        print(f"⚠️ Geocode failed → {name}: {query}")
        continue

    lat, lon = result
    print(f"📍 Geocoded {name}: {query}")

    geojson_features.append({
        "type": "Feature",
        "properties": {
            "Name": name,
            "Retailer": retailer,
            "Title": title,
            "OfficePhone": office,
            "CellPhone": cell,
            "Email": email,
            "Category": "Kingpin",
        },
        "geometry": {"type": "Point", "coordinates": [lon, lat]}
    })

# ---------------------------------------------------------------------------
# Output GeoJSON
# ---------------------------------------------------------------------------
geojson = {"type": "FeatureCollection", "features": geojson_features}

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"\n✅ Wrote Kingpin1 GeoJSON → {OUTPUT_JSON}")

# ---------------------------------------------------------------------------
# Write anomaly log
# ---------------------------------------------------------------------------
if anomalies:
    pd.DataFrame(anomalies).to_excel(ANOMALY_LOG, index=False)
    print(f"⚠️ Logged {len(anomalies)} anomalies → {ANOMALY_LOG}")
else:
    print("✔ No anomalies detected.")
