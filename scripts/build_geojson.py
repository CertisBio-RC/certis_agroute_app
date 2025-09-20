import pandas as pd
import requests
import sys
import os
import json

# 🔑 Use env token if set, otherwise fallback to your hardcoded token
MAPBOX_TOKEN = os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN") or "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21ld3lzZTNqMGQwdzJxb2lwNHpjcjNveiJ9.T2O5szdwL-O5nDF9BJmFnw"

if not MAPBOX_TOKEN:
    print("❌ ERROR: No Mapbox token found")
    sys.exit(1)

def geocode(address):
    """Geocode address into [lon, lat] using Mapbox API"""
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{address}.json"
    params = {"access_token": MAPBOX_TOKEN, "limit": 1}
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("features"):
            return data["features"][0]["geometry"]["coordinates"]
    except Exception as e:
        print(f"⚠️ Error geocoding {address}: {e}")
    return None

def main(input_xlsx, output_geojson):
    print(f"📂 Reading {input_xlsx} ...")
    df = pd.read_excel(input_xlsx)

    # Normalize column names
    df.columns = [c.strip().lower() for c in df.columns]

    # Accept multiple possible column headers for addresses
    if "address" not in df.columns and "location" not in df.columns:
        print("❌ ERROR: Missing required column: Address or Location")
        sys.exit(1)

    addr_col = "address" if "address" in df.columns else "location"
    features = []

    for i, row in df.iterrows():
        name = str(row.get("name", "")).strip()
        category = str(row.get("category", "")).strip()
        address = str(row.get(addr_col, "")).strip()

        print(f"➡️ {i+1}/{len(df)} | {name} | {address}")

        if not address or address.lower() == "nan":
            print(f"⚠️ Skipping row {i+1}: no address")
            continue

        coords = geocode(address)
        if not coords:
            print(f"⚠️ Could not geocode '{address}'")
            continue

        features.append({
            "type": "Feature",
            "properties": {"name": name, "category": category, "address": address},
            "geometry": {"type": "Point", "coordinates": coords}
        })

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(output_geojson), exist_ok=True)
    with open(output_geojson, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"✅ Wrote {len(features)} features → {output_geojson}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/build_geojson.py input.xlsx output.geojson")
        sys.exit(1)

    main(sys.argv[1], sys.argv[2])
