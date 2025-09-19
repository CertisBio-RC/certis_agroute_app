#!/usr/bin/env python3
import sys
import os
import pandas as pd
import json

def main(input_file: str, output_file: str):
    if not os.path.exists(input_file):
        print(f"❌ ERROR: Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    try:
        df = pd.read_excel(input_file)
    except Exception as e:
        print(f"❌ ERROR: Failed to read Excel file: {e}", file=sys.stderr)
        sys.exit(1)

    required_columns = {"Name", "Latitude", "Longitude", "Category"}
    missing = required_columns - set(df.columns)
    if missing:
        print(f"❌ ERROR: Missing required columns: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    features = []
    for _, row in df.iterrows():
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
        except Exception:
            print(f"⚠️ Skipping row with invalid coordinates: {row}", file=sys.stderr)
            continue

        props = {col: str(row[col]) for col in df.columns if col not in ["Latitude", "Longitude"]}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        })

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"✅ Successfully wrote {len(features)} features to {output_file}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python build_geojson.py input.xlsx output.geojson", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
