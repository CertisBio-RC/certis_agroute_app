import pandas as pd
import json
import os

# ──────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_FILE = os.path.join(BASE_DIR, "data", "kingpin_latlong.xlsx")
OUTPUT_FILE = os.path.join(BASE_DIR, "public", "data", "kingpin.geojson")

REQUIRED_COLUMNS = [
    "RETAILER NAME",
    "SUPPLIERS",
    "CONTACT NAME",
    "CONTACT TITLE",
    "ADDRESS",
    "CITY",
    "STATE",
    "ZIP CODE",
    "OFFICE PHONE",
    "CELL PHONE",
    "EMAIL",
    "Longitude",
    "Latitude",
]

# ──────────────────────────────────────────────────────────────
# LOAD & VALIDATE EXCEL
# ──────────────────────────────────────────────────────────────
df = pd.read_excel(SOURCE_FILE, dtype=str).fillna("")

missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
if missing:
    raise ValueError(f"❌ ERROR — Missing required columns: {', '.join(missing)}")

# ──────────────────────────────────────────────────────────────
# BUILD GEOJSON FEATURES
# ──────────────────────────────────────────────────────────────
features = []
for _, row in df.iterrows():
    try:
        lon = float(row["Longitude"])
        lat = float(row["Latitude"])
    except ValueError:
        continue  # skip rows without valid coordinates

    props = {
        "Retailer": row["RETAILER NAME"].strip(),
        "Suppliers": row["SUPPLIERS"].strip(),
        "ContactName": row["CONTACT NAME"].strip(),
        "ContactTitle": row["CONTACT TITLE"].strip(),
        "Address": row["ADDRESS"].strip(),
        "City": row["CITY"].strip(),
        "State": row["STATE"].strip(),
        "Zip": row["ZIP CODE"].strip(),
        "OfficePhone": row["OFFICE PHONE"].strip(),
        "CellPhone": row["CELL PHONE"].strip(),
        "Email": row["EMAIL"].strip(),
    }

    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }
    features.append(feature)

geojson = {"type": "FeatureCollection", "features": features}

# ──────────────────────────────────────────────────────────────
# WRITE FILE
# ──────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"✔ kingpin.geojson generated → {OUTPUT_FILE}")
print(f"✔ Total features: {len(features)}")
