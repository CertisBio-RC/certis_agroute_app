#!/usr/bin/env python3
import pandas as pd
import json
import sys
import os

def excel_to_geojson(excel_file, sheet_name=0, output_file="public/retailers.geojson"):
    # Load Excel
    df = pd.read_excel(excel_file, sheet_name=sheet_name)

    # Make sure required columns exist
    required_cols = ["Retailer", "Name", "Address", "City", "State", "Zip", "Category", "Latitude", "Longitude"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    features = []
    skipped = 0

    for _, row in df.iterrows():
        lat = row.get("Latitude")
        lon = row.get("Longitude")

        # Skip rows without numeric coords
        if pd.isna(lat) or pd.isna(lon):
            skipped += 1
            continue
        try:
            lat = float(lat)
            lon = float(lon)
        except ValueError:
            skipped += 1
            continue

        # Keep only U.S. bounding box
        if not (24 <= lat <= 50 and -125 <= lon <= -66):
            skipped += 1
            continue

        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "Retailer": row.get("Retailer", ""),
                "Name": row.get("Name", ""),
                "Address": row.get("Address", ""),
                "City": row.get("City", ""),
                "State": row.get("State", ""),
                "Zip": str(row.get("Zip", "")),
                "Category": row.get("Category", "")
            },
        }
        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"✅ Loaded {len(df)} rows, wrote {len(features)} valid U.S. features, skipped {skipped} rows.")
    print(f"🎉 GeoJSON successfully written to {output_file}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python convert_to_geojson.py <excel_file> [sheet_name]")
        sys.exit(1)

    excel_file = sys.argv[1]
    sheet_name = sys.argv[2] if len(sys.argv) > 2 else 0
    excel_to_geojson(excel_file, sheet_name)
