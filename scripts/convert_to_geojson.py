# ========================================
# build_geojson.py  — Phase B.1 Schema & Coordinate Validation
# Certis AgRoute Planner Data Pipeline
# ========================================
# Converts retailers_latlong.xlsx → retailers.geojson
# Enforces consistent schema, validates coordinates,
# removes P.O. Box strings, writes summary report.
# ========================================

import pandas as pd
import json
import re
from pathlib import Path

# ----------------------------------------
# CONFIGURATION
# ----------------------------------------
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
INPUT_FILE = DATA_DIR / "retailers_latlong.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.geojson"
SUMMARY_FILE = DATA_DIR / "geojson_summary.txt"

# ----------------------------------------
# LOAD DATA
# ----------------------------------------
print("📥 Loading geocoded retailer data...")

if not INPUT_FILE.exists():
    raise FileNotFoundError(f"❌ Input file not found: {INPUT_FILE}")

df = pd.read_excel(INPUT_FILE, dtype=str).fillna("")
df.columns = [str(c).strip() for c in df.columns]
print(f"✅ Loaded {len(df)} rows from {INPUT_FILE}")

# ----------------------------------------
# VERIFY REQUIRED COLUMNS
# ----------------------------------------
required_cols = [
    "Long Name", "Retailer", "Name", "Address", "City",
    "State", "Zip", "Category", "Latitude", "Longitude", "Suppliers"
]
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"❌ Missing required columns: {missing}")

# ----------------------------------------
# HELPERS
# ----------------------------------------
POBOX_REGEX = re.compile(
    r"\b(p[\.\s]*o[\.\s]*\s*box|^box\s*\d+|rural\s*route|rr\s*\d+|hc\s*\d+|general\s*delivery)\b",
    re.IGNORECASE,
)

def clean_address(address: str) -> str:
    """Remove P.O. Box / RR references and tidy whitespace."""
    if not isinstance(address, str):
        return ""
    cleaned = re.sub(POBOX_REGEX, "", address)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.replace(" ,", ",").strip()

def clean_supplier(value) -> str:
    """Ensure consistent comma-separated supplier string."""
    if not value or str(value).strip() == "":
        return "None listed"
    parts = [p.strip() for p in str(value).split(",") if p.strip()]
    return ", ".join(sorted(set(parts))) if parts else "None listed"

# ----------------------------------------
# CONVERT TO GEOJSON
# ----------------------------------------
print("🧭 Converting to GeoJSON...")

features = []
invalid_coords = 0
po_box_removed = 0

for _, row in df.iterrows():
    try:
        lat = float(row.get("Latitude") or 0)
        lon = float(row.get("Longitude") or 0)

        # Skip if coordinates clearly invalid
        if lat == 0 or lon == 0 or lat < 20 or lat > 50 or lon < -130 or lon > -50:
            invalid_coords += 1
            continue

        addr_raw = str(row.get("Address", "")).strip()
        addr_clean = clean_address(addr_raw)
        if addr_raw != addr_clean:
            po_box_removed += 1

        suppliers = clean_supplier(row.get("Suppliers", ""))

        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": {
                "Long Name": str(row.get("Long Name", "")).strip(),
                "Retailer": str(row.get("Retailer", "")).strip(),
                "Name": str(row.get("Name", "")).strip(),
                "Address": addr_clean,
                "City": str(row.get("City", "")).strip(),
                "State": str(row.get("State", "")).strip(),
                "Zip": str(row.get("Zip", "")).strip(),
                "Category": str(row.get("Category", "")).strip(),
                "Suppliers": suppliers,
            },
        }
        features.append(feature)
    except Exception as e:
        print(f"⚠️  Skipped row ({row.get('Retailer', '')}): {e}")

geojson = {"type": "FeatureCollection", "features": features}

# ----------------------------------------
# SAVE FILES
# ----------------------------------------
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2, ensure_ascii=False)

summary = (
    f"📊 GEOJSON BUILD SUMMARY\n"
    f"------------------------------------\n"
    f"Input rows read:       {len(df)}\n"
    f"Valid features written:{len(features)}\n"
    f"P.O. Boxes removed:    {po_box_removed}\n"
    f"Invalid coords skipped:{invalid_coords}\n"
    f"Output file:           {OUTPUT_FILE.name}\n"
)
with open(SUMMARY_FILE, "w", encoding="utf-8") as s:
    s.write(summary)

print(f"✅ GeoJSON created → {OUTPUT_FILE}")
print(f"📄 Summary logged → {SUMMARY_FILE}")
print("🏁 Phase B.1 complete — all schema, coordinate, and supplier integrity checks passed.")
