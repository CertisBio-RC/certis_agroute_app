# scripts/convert_to_geojson_kingpin.py

import pandas as pd
import json
import os

INPUT_FILE = os.path.join("data", "kingpin_latlong.xlsx")
OUTPUT_FILE = os.path.join("public", "data", "kingpin.geojson")


def main():
    print(f"[convert_to_geojson_kingpin] Loading: {INPUT_FILE}")
    df = pd.read_excel(INPUT_FILE)

    features = []

    for _, row in df.iterrows():
        lng = row["Longitude"]
        lat = row["Latitude"]

        if pd.isna(lng) or pd.isna(lat):
            continue

        props = {
            "Retailer": row["RETAILER"],
            "Address": row["ADDRESS"],
            "City": row["CITY"],
            "State": row["STATE"],
            "Zip": row["ZIP CODE"],
            "Contacts": row["CONTACTS"] if "CONTACTS" in df.columns else ""
        }

        feat = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": props
        }

        features.append(feat)

    geo = {"type": "FeatureCollection", "features": features}

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geo, f, indent=2)

    print(f"[OK] Kingpin GeoJSON saved → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
