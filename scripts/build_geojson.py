# scripts/build_geojson.py
import pandas as pd
import json
from pathlib import Path

# ========================================
# CONFIGURATION
# ========================================
DATA_DIR = Path("data")
INPUT_FILE = DATA_DIR / "retailers_latlong.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.geojson"

# ========================================
# LOAD DATA
# ========================================
print("Loading geocoded retailer data...")

if not INPUT_FILE.exists():
    raise FileNotFoundError(f"ERROR: Input file not found: {INPUT_FILE}")

df = pd.read_excel(INPUT_FILE)
print(f"Loaded {len(df)} rows from {INPUT_FILE}")

# ========================================
# COLUMN VALIDATION
# ========================================
required_columns = [
    "Long Name",
    "Retailer",
    "Name",
    "Address",
    "City",
    "State",
    "Zip",
    "Category",
    "Suppliers",
    "Latitude",
    "Longitude",
]

missing = [c for c in required_columns if c not in df.columns]
if missing:
    raise ValueError(f"Missing columns: {missing}")

# ========================================
# CONVERT TO GEOJSON
# ========================================
print("Converting to GeoJSON...")

def parse_suppliers(value):
    """Convert supplier cell to a clean list."""
    if pd.isna(value) or str(value).strip() == "":
        return []
    return [s.strip() for s in str(value).split(",") if s.strip()]

features = []
for _, row in df.iterrows():
    lat = row["Latitude"]
    lon = row["Longitude"]

    if pd.isna(lat) or pd.isna(lon):
        continue

    suppliers = parse_suppliers(row["Suppliers"])

    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
        "properties": {
            "Long Name": str(row["Long Name"]).strip(),
            "Retailer": str(row["Retailer"]).strip(),
            "Name": str(row["Name"]).strip(),
            "Address": str(row["Address"]).strip(),
            "City": str(row["City"]).strip(),
            "State": str(row["State"]).strip(),
            "Zip": str(row["Zip"]).strip(),
            "Category": str(row["Category"]).strip(),
            "Suppliers": suppliers,
        },
    }
    features.append(feature)

geojson = {"type": "FeatureCollection", "features": features}

# ========================================
# SAVE FILE
# ========================================
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"GeoJSON file created: {OUTPUT_FILE}")
print(f"Total features exported: {len(features)}")
