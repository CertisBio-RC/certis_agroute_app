# scripts/convert_to_geojson.py

import pandas as pd
import json
import os

INPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join("public", "data", "retailers.geojson")


def parse_suppliers(value):
    if pd.isna(value):
        return []
    return [s.strip() for s in str(value).replace("|", ",").split(",") if s.strip()]


def main():
    print(f"[convert_to_geojson] Loading: {INPUT_FILE}")
    df = pd.read_excel(INPUT_FILE)

    features = []

    for _, row in df.iterrows():
        lng = row["Longitude"]
        lat = row["Latitude"]

        if pd.isna(lng) or pd.isna(lat):
            continue

        props = {
            "Retailer": row["Retailer"],
            "Name": row["Name"],
            "Address": row["Address"],
            "City": row["City"],
            "State": row["State"],
            "Zip": row["Zip"],
            "Category": row["Category"],
            "Suppliers": parse_suppliers(row["Suppliers"])
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

    print(f"[OK] GeoJSON saved → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
