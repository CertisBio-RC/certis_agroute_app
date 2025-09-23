#!/usr/bin/env python3
import pandas as pd
import json
import sys
import os

def excel_to_geojson(excel_file: str, sheet_name: str = None, output_file: str = "public/retailers.geojson"):
    # Load Excel file
    if sheet_name:
        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        print(f"✅ Loaded sheet: {sheet_name}")
    else:
        # Default to first sheet if not provided
        df = pd.read_excel(excel_file, sheet_name=0)
        print(f"✅ Loaded first sheet: {df.columns.tolist()}")

    required_cols = ["Name", "Address", "City", "State", "Zip", "Category", "Latitude", "Longitude"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"❌ Missing required column: {col}")

    features = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
        except (ValueError, TypeError):
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
                "name": str(row.get("Name", "")),
                "address": str(row.get("Address", "")),
                "city": str(row.get("City", "")),
                "state": str(row.get("State", "")),
                "zip": str(row.get("Zip", "")),
                "category": str(row.get("Category", "")),
                "retailer": str(row.get("Retailer", "")) if "Retailer" in row else "",
                "suppliers": str(row.get("Suppliers", "")) if "Suppliers" in row else "",
            },
        }
        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"✅ Loaded {len(df)} rows, wrote {len(features)} valid U.S. features, skipped {skipped} rows.")
    print(f"🎉 GeoJSON successfully written to {output_file}")

    # 🟢 Sanity check: print first 5 coordinates
    print("\n🔎 Sample of first 5 points:")
    for f in features[:5]:
        coords = f["geometry"]["coordinates"]
        name = f["properties"]["name"]
        city = f["properties"]["city"]
        state = f["properties"]["state"]
        print(f"   {name} – {city}, {state}  ({coords[1]}, {coords[0]})")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: convert_to_geojson.py <input_excel_file> [sheet_name]")
        sys.exit(1)

    excel_file = sys.argv[1]
    sheet_name = sys.argv[2] if len(sys.argv) > 2 else None
    excel_to_geojson(excel_file, sheet_name)
