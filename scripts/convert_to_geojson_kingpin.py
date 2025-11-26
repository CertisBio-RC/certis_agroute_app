# scripts/convert_to_geojson_kingpin.py
import pandas as pd
import json
import numpy as np
import os

INPUT_FILE = "data/kingpin_latlong.xlsx"
OUTPUT_FILE = "../public/data/kingpin.geojson"

def safe(v):
    """Convert NaN → empty string."""
    if pd.isna(v):
        return ""
    return str(v).strip()

def safe_float(v):
    """Convert float NaN → None, else float."""
    try:
        f = float(v)
        if np.isnan(f):
            return None
        return f
    except:
        return None

def main():
    print("🔵 Loading cleaned Kingpin data...")
    df = pd.read_excel(INPUT_FILE)

    features = []

    for _, row in df.iterrows():
        lon = safe_float(row.get("Longitude"))
        lat = safe_float(row.get("Latitude"))

        if lon is None or lat is None:
            # Skip entries without coordinates
            continue

        props = {
            "Retailer": safe(row.get("RETAILER")),
            "Address": safe(row.get("ADDRESS")),
            "City": safe(row.get("CITY")),
            "State": safe(row.get("STATE.1")),
            "Zip": safe(row.get("ZIP CODE")),
            "Supplier": safe(row.get("SUPPLIER")),
            "Contact": safe(row.get("CONTACT NAME")),
            "Phone": safe(row.get("OFFICE PHONE")),
            "Email": safe(row.get("EMAIL")),
            "Category": "Kingpin",
        }

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            },
            "properties": props,
        }

        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    print(f"🔵 Saving to {OUTPUT_FILE}")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print("✅ Kingpin GeoJSON written successfully.")


if __name__ == "__main__":
    main()
