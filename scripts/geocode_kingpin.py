# ==============================================================
# CERTIS AGROUTE — KINGPIN GEOCODER (FINAL GOLD VERSION)
#   • Uses correct input file: data/kingpin1_COMBINED.xlsx
#   • Uses token.json (no reliance on system env vars)
#   • Produces:
#       → data/kingpin_latlong.xlsx
#       → public/data/kingpin.geojson
# ==============================================================

import pandas as pd
import requests
import json
import time
import os

INPUT_FILE = os.path.join("data", "kingpin1_COMBINED.xlsx")
OUTPUT_FILE = os.path.join("data", "kingpin_latlong.xlsx")
GEOJSON_FILE = os.path.join("public", "data", "kingpin.geojson")
TOKEN_FILE = os.path.join("data", "token.json")

# ----------------------------------------------------------
# Load Mapbox Token
# ----------------------------------------------------------
def load_token():
    if not os.path.exists(TOKEN_FILE):
        raise FileNotFoundError("ERROR: token.json not found in /data.")
    with open(TOKEN_FILE, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
        return data["MAPBOX_TOKEN"]

# ----------------------------------------------------------
# Geocoder helper
# ----------------------------------------------------------
def geocode(address, token):
    url = f"https://api.mapbox.com/search/geocode/v6/forward?q={address}&access_token={token}"
    r = requests.get(url).json()

    try:
        coords = r["features"][0]["geometry"]["coordinates"]
        return coords[0], coords[1]
    except Exception:
        return None, None

# ----------------------------------------------------------
# Main logic
# ----------------------------------------------------------
def main():
    print("\n===========================================")
    print("  CERTIS — KINGPIN GEOCODING STARTING")
    print("===========================================\n")

    # Load Excel
    df = pd.read_excel(INPUT_FILE)

    token = load_token()

    # Prepare output fields
    longitudes = []
    latitudes = []

    # Iterate through rows
    for _, row in df.iterrows():
        # Build geocoding address (correct fields from Excel)
        address = f"{row['ADDRESS']}, {row['CITY']}, {row['STATE']} {row['ZIP CODE']}"
        lng, lat = geocode(address, token)

        longitudes.append(lng)
        latitudes.append(lat)

        time.sleep(0.15)

    # Attach coordinates
    df["Longitude"] = longitudes
    df["Latitude"] = latitudes

    # Save Excel
    df.to_excel(OUTPUT_FILE, index=False)
    print(f"📘 Saved Excel → {OUTPUT_FILE}")

    # Build GeoJSON
    features = []
    for _, row in df.iterrows():
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [row["Longitude"], row["Latitude"]],
            },
            "properties": {
                "RetailerName": row["RETAILER NAME"],
                "Supplier": row["SUPPLIER"],
                "ContactName": row["CONTACT NAME"],
                "Title": row["CONTACT TITLE"],
                "Address": row["ADDRESS"],
                "City": row["CITY"],
                "State": row["STATE"],
                "Zip": str(row["ZIP CODE"]),
                "OfficePhone": row["OFFICE PHONE"],
                "CellPhone": row["CELL PHONE"],
                "Email": row["EMAIL"],
                "Category": "Kingpin"
            }
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    # Save GeoJSON
    with open(GEOJSON_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"📍 Saved GeoJSON → {GEOJSON_FILE}")
    print("✅ Kingpin Geocoding Complete\n")


if __name__ == "__main__":
    main()
