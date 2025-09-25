#!/usr/bin/env python3
import pandas as pd
import json
import sys
import os
import requests
from urllib.parse import quote

# ==============================
# 🔑 Load Mapbox Token
# ==============================
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN")
if not MAPBOX_TOKEN:
    print("⚠️ No MAPBOX_TOKEN environment variable found. Geocoding will be skipped.")

# ==============================
# 📦 Simple in-memory cache
# ==============================
geocode_cache = {}

def normalize_address(addr: str) -> str:
    """Replace '#' with 'Suite' and clean whitespace."""
    if not isinstance(addr, str):
        return ""
    return addr.replace("#", " Suite ").strip()

def geocode_address(address: str):
    """
    Always geocode an address using Mapbox API, with in-memory caching.
    Returns (lat, lon) or (None, None) if fails.
    """
    if not MAPBOX_TOKEN:
        return None, None

    if address in geocode_cache:
        return geocode_cache[address]

    # URL-encode the address for Mapbox
    safe_address = quote(address)

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{safe_address}.json"
    params = {"access_token": MAPBOX_TOKEN, "limit": 1}
    try:
        resp = requests.get(url, params=params, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("features"):
            lon, lat = data["features"][0]["geometry"]["coordinates"]
            geocode_cache[address] = (lat, lon)
            return lat, lon
    except Exception as e:
        print(f"❌ Geocoding failed for {address}: {e}")

    geocode_cache[address] = (None, None)
    return None, None


def excel_to_geojson(excel_file: str, sheet_name: str = None, output_file: str = "public/retailers.geojson"):
    # Load Excel file
    if sheet_name:
        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        print(f"✅ Loaded sheet: {sheet_name}")
    else:
        df = pd.read_excel(excel_file, sheet_name=0)
        print(f"✅ Loaded first sheet: {df.columns.tolist()}")

    required_cols = ["Long Name", "Retailer", "Name", "Address", "City", "State", "Zip", "Category", "Suppliers", "Latitude", "Longitude"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"❌ Missing required column: {col}")

    features = []
    skipped = 0
    fallback_used = 0

    for _, row in df.iterrows():
        # Always build normalized address string
        raw_address = str(row['Address'])
        address = normalize_address(raw_address)
        full_address = f"{address}, {row['City']}, {row['State']} {row['Zip']}"

        lat, lon = geocode_address(full_address)

        if lat is None or lon is None:
            # Fallback: use Excel lat/long if present
            excel_lat = row.get("Latitude", None)
            excel_lon = row.get("Longitude", None)
            if pd.notnull(excel_lat) and pd.notnull(excel_lon):
                lat, lon = excel_lat, excel_lon
                fallback_used += 1
                print(f"⚠️  Fallback to Excel coords for: {full_address}")
            else:
                skipped += 1
                continue

        # ✅ Keep only U.S. bounding box
        if not (24.0 <= lat <= 49.5 and -125.0 <= lon <= -66.0):
            skipped += 1
            continue

        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "LongName": str(row.get("Long Name", "")),
                "Retailer": str(row.get("Retailer", "")),
                "Name": str(row.get("Name", "")),
                "Address": str(row.get("Address", "")),
                "City": str(row.get("City", "")),
                "State": str(row.get("State", "")),
                "Zip": str(row.get("Zip", "")),
                "Category": str(row.get("Category", "")),
                "Suppliers": str(row.get("Suppliers", "")),
            },
        }
        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"✅ Loaded {len(df)} rows, wrote {len(features)} valid U.S. features, skipped {skipped} rows.")
    print(f"⚠️  Fallback used on {fallback_used} rows.")
    print(f"🎉 GeoJSON successfully written to {output_file}")

    # 🟢 Sanity check: print first 5 coordinates
    print("\n🔎 Sample of first 5 points:")
    for f in features[:5]:
        coords = f["geometry"]["coordinates"]
        props = f["properties"]
        print(
            f"   {props['LongName']} ({props['City']}, {props['State']}) "
            f"(Suppliers: {props['Suppliers']}) "
            f"({coords[1]}, {coords[0]})"
        )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: convert_to_geojson.py <input_excel_file> [sheet_name]")
        sys.exit(1)

    excel_file = sys.argv[1]
    sheet_name = sys.argv[2] if len(sys.argv) > 2 else None
    excel_to_geojson(excel_file, sheet_name)
