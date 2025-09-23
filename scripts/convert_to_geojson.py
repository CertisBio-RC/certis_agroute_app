# scripts/convert_to_geojson.py
import sys
import pandas as pd
import json
import os

def excel_to_geojson(excel_file: str, output_file: str = "public/retailers.geojson"):
    try:
        # Read the first sheet automatically
        df = pd.read_excel(excel_file, sheet_name=0)
        print(f"✅ Loaded sheet: {df.columns.tolist()}")

        features = []

        for _, row in df.iterrows():
            # Ensure we have lat/long
            if pd.isna(row.get("Longitude")) or pd.isna(row.get("Latitude")):
                continue

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["Longitude"]), float(row["Latitude"])],
                },
                "properties": {
                    "name": row.get("Name", ""),
                    "address": row.get("Address", ""),
                    "city": row.get("City", ""),
                    "state": row.get("State", ""),
                    "zip": str(row.get("Zip", "")),
                    "category": row.get("Category", "Unknown"),
                },
            }
            features.append(feature)

        geojson = {
            "type": "FeatureCollection",
            "features": features,
        }

        # Ensure public directory exists
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(geojson, f, indent=2)

        print(f"🎉 GeoJSON successfully written to {output_file} ({len(features)} features).")

    except Exception as e:
        print(f"❌ Error converting Excel to GeoJSON: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/convert_to_geojson.py <excel_file>")
        sys.exit(1)

    excel_file = sys.argv[1]
    excel_to_geojson(excel_file)
