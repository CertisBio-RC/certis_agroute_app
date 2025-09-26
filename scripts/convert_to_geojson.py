# scripts/convert_to_geojson.py

import os
import sys
import pandas as pd
import json

# ✅ Canonical paths
INPUT_XLSX = os.path.join("data", "retailers_latlong.xlsx")   # source of truth
OUTPUT_GEOJSON = os.path.join("public", "data", "retailers.geojson")  # web-facing


def main():
    print("📂 Certis AgRoute Planner — Excel → GeoJSON Pipeline")
    print(f"   Input XLSX: {INPUT_XLSX}")
    print(f"   Output GeoJSON: {OUTPUT_GEOJSON}")

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
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {k: (v if pd.notna(v) else None) for k, v in properties.items()},
        }
        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    # --- Step 5: Save output ---
    os.makedirs(os.path.dirname(OUTPUT_GEOJSON), exist_ok=True)
    try:
        with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)

        print(f"✅ Successfully created {OUTPUT_GEOJSON} with {len(features)} features.")
        if features:
            print("🔎 Example properties from first feature:")
            print(json.dumps(features[0]["properties"], indent=2))
    except Exception as e:
        print(f"❌ ERROR: Could not write {OUTPUT_GEOJSON}: {e}")
        sys.exit(1)

    # --- Step 6: Sanity check ---
    # Warn if a second copy of the Excel exists under /public/data
    stray_excel = os.path.join("public", "data", "retailers_latlong.xlsx")
    if os.path.exists(stray_excel):
        print(f"⚠️ WARNING: Found stray file {stray_excel}. Please delete it to avoid confusion.")


if __name__ == "__main__":
    main()
