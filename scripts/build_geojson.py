# ========================================
# build_geojson.py
# ========================================
# Converts retailers_latlong.xlsx → retailers.geojson
# Cleans P.O. Box addresses and ensures Suppliers are included
# Outputs single-supplier entries as strings instead of lists
# ========================================

import pandas as pd
import json
import re
from pathlib import Path

# ----------------------------------------
# CONFIGURATION
# ----------------------------------------
DATA_DIR = Path("data")
INPUT_FILE = DATA_DIR / "retailers_latlong.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.geojson"

# ----------------------------------------
# LOAD DATA
# ----------------------------------------
print("📥 Loading geocoded retailer data...")

if not INPUT_FILE.exists():
    raise FileNotFoundError(f"ERROR: Input file not found: {INPUT_FILE}")

df = pd.read_excel(INPUT_FILE)
df.columns = [str(c).strip() for c in df.columns]  # normalize column names
print(f"✅ Loaded {len(df)} rows from {INPUT_FILE}")

# ----------------------------------------
# FIND SUPPLIER COLUMN
# ----------------------------------------
supplier_col = next((c for c in df.columns if "supplier" in c.lower()), None)
if not supplier_col:
    raise ValueError("❌ No supplier-related column found in dataset.")

# ----------------------------------------
# COLUMN VALIDATION
# ----------------------------------------
required_columns = [
    "Long Name",
    "Retailer",
    "Name",
    "Address",
    "City",
    "State",
    "Zip",
    "Category",
    "Latitude",
    "Longitude",
]
missing = [c for c in required_columns if c not in df.columns]
if missing:
    raise ValueError(f"❌ Missing required columns: {missing}")

# ----------------------------------------
# CLEANUP HELPERS
# ----------------------------------------
def clean_address(address: str) -> str:
    """Remove P.O. Box references and tidy whitespace."""
    if not isinstance(address, str):
        return address
    cleaned = re.sub(r'\bP\.?\s*O\.?\s*Box\s*\d*\b', '', address, flags=re.IGNORECASE)
    cleaned = re.sub(r'\bBox\s*\d+\b', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).replace(' ,', ',').strip()
    return cleaned

def parse_suppliers(value):
    """Convert supplier cell to string or list as appropriate."""
    if pd.isna(value) or str(value).strip() == "":
        return None
    suppliers = [s.strip() for s in str(value).split(",") if s.strip()]
    if not suppliers:
        return None
    return suppliers[0] if len(suppliers) == 1 else suppliers

# ----------------------------------------
# CONVERT TO GEOJSON
# ----------------------------------------
print("🧭 Converting to GeoJSON...")
features = []
po_box_removed = 0

for _, row in df.iterrows():
    lat = row.get("Latitude")
    lon = row.get("Longitude")
    if pd.isna(lat) or pd.isna(lon):
        continue

    address_raw = str(row.get("Address", "")).strip()
    address_cleaned = clean_address(address_raw)
    if address_raw != address_cleaned:
        po_box_removed += 1

    suppliers = parse_suppliers(row.get(supplier_col))

    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
        "properties": {
            "Long Name": str(row.get("Long Name", "")).strip(),
            "Retailer": str(row.get("Retailer", "")).strip(),
            "Name": str(row.get("Name", "")).strip(),
            "Address": address_cleaned,
            "City": str(row.get("City", "")).strip(),
            "State": str(row.get("State", "")).strip(),
            "Zip": str(row.get("Zip", "")).strip(),
            "Category": str(row.get("Category", "")).strip(),
            "Suppliers": suppliers,
        },
    }
    features.append(feature)

geojson = {"type": "FeatureCollection", "features": features}

# ----------------------------------------
# SAVE FILE
# ----------------------------------------
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"✅ GeoJSON file created: {OUTPUT_FILE}")
print(f"📊 Total features exported: {len(features)}")
print(f"📦 Addresses cleaned of P.O. Box references: {po_box_removed}")
print(f"🏁 Suppliers column used: {supplier_col}")
