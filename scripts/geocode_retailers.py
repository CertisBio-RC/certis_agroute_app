# ================================================================
#  CERTIS AGROUTE — RETAILER GEOCODER (FINAL)
#  • Reads:   data/retailers.xlsx
#  • Saves:   data/retailers_latlong.xlsx
#  • GeoJSON: public/data/retailers.geojson
#  • Token:   data/token.json only (NOT env vars)
# ================================================================

import pandas as pd
import requests
import json
import time
import os

INPUT_FILE = os.path.join("data", "retailers.xlsx")
OUTPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
GEOJSON_FILE = os.path.join("public", "data", "retailers.geojson")
TOKEN_FILE = os.path.join("data", "token.json")

# --------------------------------------------------
# Load Mapbox Token
# --------------------------------------------------
def load_token():
    if not os.path.exists(TOKEN_FILE):
        raise FileNotFoundError("ERROR: token.json not found in /data.")
    with open(TOKEN_FILE, "r", encoding="utf-8-sig") as f:
        return json.load(f)["MAPBOX_TOKEN"]

# --------------------------------------------------
# Geocode using Mapbox Search API v6
# --------------------------------------------------
def geocode(address, token):
    url = f"https://api.mapbox.com/search/geocode/v6/forward?q={address}&access_token={token}"

    try:
        r = requests.get(url, timeout=10).json()
        coords = r["features"][0]["geometry"]["coordinates"]
        return coords[0], coords[1]   # (lng, lat)
    except Exception:
        return None, None

# --------------------------------------------------
# Build GeoJSON Feature
# --------------------------------------------------
def make_feature(row):
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [row["Longitude"], row["Latitude"]],
        },
        "properties": {
            "LongName": row["Long Name"],
            "Retailer": row["Retailer"],
            "Name": row["Name"],
            "Address": row["Address"],
            "City": row["City"],
            "State": row["State"],
            "Zip": str(row["Zip"]),
            "Category": row["Category"],
            "Suppliers": row["Suppliers"],
        },
    }

# --------------------------------------------------
# Main
# --------------------------------------------------
def main():
    print("\n===========================================")
    print("  CERTIS — RETAILER GEOCODING STARTING")
    print("===========================================\n")

    token = load_token()

    df = pd.read_excel(INPUT_FILE)

    longitudes = []
    latitudes = []

    for idx, row in df.iterrows():
        address = f"{row['Address']}, {row['City']}, {row['State']} {row['Zip']}"
        print(f"→ Geocoding {row['Retailer']} — {address}")

        lng, lat = geocode(address, token)
        longitudes.append(lng)
        latitudes.append(lat)

        time.sleep(0.15)  # prevent API throttling

    df["Longitude"] = longitudes
    df["Latitude"] = latitudes

    df.to_excel(OUTPUT_FILE, index=False)
    print(f"\n📘 Saved Excel → {OUTPUT_FILE}")

    # Build GeoJSON
    features = []
    for _, row in df.iterrows():
        if row["Longitude"] and row["Latitude"]:
            features.append(make_feature(row))

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(GEOJSON_FILE), exist_ok=True)
    with open(GEOJSON_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"📍 Saved GeoJSON → {GEOJSON_FILE}")
    print("\n✅ Retailer Geocoding Complete\n")


if __name__ == "__main__":
    main()
