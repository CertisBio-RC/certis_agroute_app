# ============================================================
#  CERTIS AGROUTE — RETAILERS → GEOJSON CONVERTER (FINAL FIXED)
#  • Converts retailers_latlong.xlsx → retailers.geojson
#  • NO geocoding — coordinates already in xlsx
#  • Ensures Suppliers is ALWAYS a string (never an array)
# ============================================================

import pandas as pd
import json
import os


INPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join("public", "data", "retailers.geojson")


def main():
    print("===========================================")
    print("  CERTIS — RETAILERS GEOJSON CONVERTER")
    print("===========================================")
    print(f"📘 Loading Excel → {INPUT_FILE}")

    df = pd.read_excel(INPUT_FILE)

    # Avoid NaN
    df = df.fillna("")

    features = []

    for _, row in df.iterrows():
        try:
            lon = float(row["Longitude"])
            lat = float(row["Latitude"])
        except:
            continue  # skip invalid rows

        # =====================================================
        # FIXED SUPPLIERS HANDLING — ALWAYS FLAT STRING
        raw_sup = row.get("Suppliers", "")

        if isinstance(raw_sup, list):
            suppliers = ", ".join([str(s).strip() for s in raw_sup if str(s).strip()])
        else:
            suppliers = str(raw_sup).strip()

        # =====================================================
        # PROPERTIES
        properties = {
            "LongName": row.get("Long Name", "").strip(),
            "Retailer": row.get("Retailer", "").strip(),
            "Name": row.get("Name", "").strip(),
            "Address": row.get("Address", "").strip(),
            "City": row.get("City", "").strip(),
            "State": row.get("State", "").strip(),
            "Zip": str(row.get("Zip", "")).strip(),
            "Category": row.get("Category", "").strip(),
            "Suppliers": suppliers,  # <— FIXED
        }

        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": properties,
        }

        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print(f"📍 Saved GeoJSON → {OUTPUT_FILE}")
    print("✅ Retailer GeoJSON Generation Complete")


if __name__ == "__main__":
    main()
