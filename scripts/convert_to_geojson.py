# scripts/convert_to_geojson.py

import os
import sys
import pandas as pd
import json

# Input and output paths
INPUT_XLSX = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_GEOJSON = os.path.join("data", "retailers.geojson")

def main():
    # --- Step 1: Validate input file ---
    if not os.path.exists(INPUT_XLSX):
        print(f"❌ ERROR: Input file not found at {INPUT_XLSX}")
        sys.exit(1)

    # --- Step 2: Load Excel into DataFrame ---
    try:
        df = pd.read_excel(INPUT_XLSX)
    except Exception as e:
        print(f"❌ ERROR: Could not read {INPUT_XLSX}: {e}")
        sys.exit(1)

    # --- Step 3: Validate required columns ---
    required_columns = ["Latitude", "Longitude"]
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        print(f"❌ ERROR: Missing required columns: {missing}")
        print(f"Columns in file: {list(df.columns)}")
        sys.exit(1)

    # --- Step 4: Convert DataFrame to GeoJSON ---
    features = []
    for _, row in df.iterrows():
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
        except (ValueError, TypeError):
            print(f"⚠️ Skipping row with invalid lat/long: {row.to_dict()}")
            continue

        properties = {
            "Retailer": row.get("Retailer"),
            "Long Name": row.get("Long Name"),
            "Name": row.get("Site Name") or row.get("Name"),
            "Address": row.get("Address"),
            "City": row.get("City"),
            "State": row.get("State"),
            "Zip": row.get("Zip"),
            "Category": row.get("Category"),
            "Suppliers": row.get("Suppliers"),
        }

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            },
            "properties": {k: (v if pd.notna(v) else None) for k, v in properties.items()},
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    # --- Step 5: Save output ---
    try:
        with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)
        print(f"✅ Successfully created {OUTPUT_GEOJSON} with {len(features)} features.")
    except Exception as e:
        print(f"❌ ERROR: Could not write {OUTPUT_GEOJSON}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
