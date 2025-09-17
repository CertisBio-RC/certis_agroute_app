import os
import json
import pandas as pd
from geopy.geocoders import MapBox
from pathlib import Path

# ✅ Always pull from NEXT_PUBLIC_MAPBOX_TOKEN
mapbox_token = os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN")
if not mapbox_token:
    raise RuntimeError("Missing NEXT_PUBLIC_MAPBOX_TOKEN environment variable")

# Paths
xlsx_file = Path("data/retailers.xlsx")
geojson_file = Path("public/data/retailers.geojson")
cache_file = Path("public/data/geocode-cache.json")

# Load cache
if cache_file.exists():
    with open(cache_file, "r") as f:
        cache = json.load(f)
else:
    cache = {}

# Initialize geocoder
geolocator = MapBox(api_key=mapbox_token)

# Load Excel
df = pd.read_excel(xlsx_file)

features = []
for _, row in df.iterrows():
    name = str(row.get("Name", "")).strip()
    address = str(row.get("Address", "")).strip()
    category = str(row.get("Category", "")).strip()
    supplier = str(row.get("Supplier", "")).strip()
    retailer = str(row.get("Retailer", "")).strip()

    if not address:
        continue

    # Use cached coordinates if available
    if address in cache:
        location = cache[address]
    else:
        loc = geolocator.geocode(address)
        if loc:
            location = {"lat": loc.latitude, "lon": loc.longitude}
            cache[address] = location
        else:
            continue

    features.append({
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [location["lon"], location["lat"]],
        },
        "properties": {
            "name": name,
            "address": address,
            "category": category,
            "supplier": supplier,
            "retailer": retailer,
        },
    })

# Save GeoJSON
geojson = {"type": "FeatureCollection", "features": features}
geojson_file.parent.mkdir(parents=True, exist_ok=True)
with open(geojson_file, "w") as f:
    json.dump(geojson, f, indent=2)

# Save cache
with open(cache_file, "w") as f:
    json.dump(cache, f, indent=2)

print(f"✅ GeoJSON saved to {geojson_file}")
