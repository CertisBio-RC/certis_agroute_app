#!/usr/bin/env python3
# =====================================================================
# 💠 CERTIS AGROUTE — RETAILERS → GEOJSON CONVERSION (FINAL GOLD)
#   • Reads:   /data/retailers_latlong.xlsx
#   • Writes:  /public/data/retailers.geojson
#   • Preserves Supplier list EXACTLY as provided in Excel
#   • Required columns in Excel:
#       Long Name | Retailer | Name | Address | City | State | Zip
#       Category | Suppliers | Longitude | Latitude
# =====================================================================

import pandas as pd
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_FILE = os.path.join(ROOT, "data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join(ROOT, "public", "data", "retailers.geojson")

# Load Excel
df = pd.read_excel(SOURCE_FILE, dtype=str).fillna("")

required_cols = [
    "Long Name", "Retailer", "Name", "Address", "City", "State", "Zip",
    "Category", "Suppliers", "Longitude", "Latitude"
]

missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"❌ ERROR — Missing required columns in Excel: {', '.join(missing)}")

features = []
for _, row in df.iterrows():
    # Skip rows without coordinates
    try:
        lon = float(row["Longitude"])
        lat = float(row["Latitude"])
    except Exception:
        continue

    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat]
        },
        "properties": {
            # Displayed fields
            "Retailer": row["Retailer"].strip(),
            "Name": row["Name"].strip(),
            "Address": row["Address"].strip(),
            "City": row["City"].strip(),
            "State": row["State"].strip(),
            "Zip": row["Zip"].strip(),
            "Category": row["Category"].strip(),
            "Suppliers": row["Suppliers"].strip(),

            # Stored for completeness (not displayed)
            "LongName": row["Long Name"].strip(),
        },
    }

    features.append(feature)

geojson = {"type": "FeatureCollection", "features": features}

os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"✔ retailers.geojson generated → {OUTPUT_FILE}")
print(f"✔ Total features: {len(features)}")
