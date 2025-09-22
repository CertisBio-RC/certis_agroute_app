import pandas as pd
import json
import os

# ================================
# 📂 Input / Output file paths
# ================================
INPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join("data", "retailers.geojson")

def main():
    print("📂 Loading Excel with lat/long...")

    # Read the Excel file
    df = pd.read_excel(INPUT_FILE)

    # Ensure required columns exist
    required_cols = {"Latitude", "Longitude", "Name"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"❌ Missing columns in Excel: {missing}")

    features = []
    for _, row in df.iterrows():
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
        except Exception:
            print(f"⚠️ Skipping row with invalid lat/long: {row}")
            continue

        # ✅ Correct order: [lon, lat]
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            },
            "properties": {
                "name": str(row.get("Name", "")),
                # Include any other metadata columns you want
            },
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"✅ Wrote {len(features)} features to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
