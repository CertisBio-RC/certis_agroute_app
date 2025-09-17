import json
import pandas as pd
from pathlib import Path
from geopy.geocoders import MapBox
import os

# Config - check both env vars for flexibility
MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN") or os.environ.get("MAPBOX_PUBLIC_TOKEN")
if not MAPBOX_TOKEN:
    raise RuntimeError("Missing MAPBOX_TOKEN or MAPBOX_PUBLIC_TOKEN environment variable")

# Paths
xlsx_path = Path("data/retailers.xlsx")  # ✅ Correct path
cache_path = Path("public/data/geocode-cache.json")
out_path = Path("public/data/retailers.geojson")

# Load Excel
df = pd.read_excel(xlsx_path)

# Load cache if exists
cache = {}
if cache_path.exists():
    cache = json.loads(cache_path.read_text())

geocoder = MapBox(api_key=MAPBOX_TOKEN)

features = []
for _, row in df.iterrows():
    retailer = str(row.get("Retailer") or "").strip()
    name = str(row.get("Name") or "").strip()
    address = str(row.get("Address") or "").strip()
    city = str(row.get("City") or "").strip()
    state = str(row.get("State") or "").strip()
    category = str(row.get("Category") or "").strip()
    supplier = str(row.get("Suppliers") or "").strip()

    full_addr = f"{address}, {city}, {state}"

    if not retailer or not full_addr.strip(", "):
        continue

    # Geocode with cache
    if full_addr in cache:
        lat, lon = cache[full_addr]
    else:
        try:
            loc = geocoder.geocode(full_addr, timeout=10)
            if loc:
                lat, lon = loc.latitude, loc.longitude
                cache[full_addr] = [lat, lon]
            else:
                print(f"Failed to geocode: {full_addr}")
                continue
        except Exception as e:
            print(f"Error geocoding {full_addr}: {e}")
            continue

    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "retailer": retailer,
            "name": name,
            "address": full_addr,
            "category": category,
            "supplier": supplier,
            "logo": f"/icons/{retailer}.png"  # ✅ expects logo in public/icons
        }
    })

# Write GeoJSON
geojson = {"type": "FeatureCollection", "features": features}
out_path.write_text(json.dumps(geojson, indent=2))

# Update cache
cache_path.write_text(json.dumps(cache, indent=2))
