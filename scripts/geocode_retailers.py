# ========================================
# geocode_retailers.py
# Certis AgRoute Planner – Phase A.3 Supplier Normalization Patch
# ========================================
# Ensures consistent "Suppliers" field for popups & filters.
# Builds retailers_latlong.xlsx + retailers.geojson with
# 6-decimal precision and complete metadata.
# ========================================

import json
import pandas as pd
import requests
from time import sleep
from pathlib import Path
import re

# ========================================
# CONFIGURATION
# ========================================
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
INPUT_FILE = DATA_DIR / "retailers.xlsx"
OUTPUT_XLSX = DATA_DIR / "retailers_latlong.xlsx"
OUTPUT_GEOJSON = DATA_DIR / "retailers.geojson"
CACHE_FILE = DATA_DIR / "geocode_cache.json"

MAPBOX_TOKEN = "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21mempnNTBmMDNibjJtb2ZycTJycDB6YyJ9.9LIIYF2Bwn_aRSsuOBSI3g"
RATE_LIMIT_DELAY = 0.25  # seconds

# ========================================
# LOAD DATA
# ========================================
print("📥 Loading retailer Excel file...")

if not INPUT_FILE.exists():
    raise FileNotFoundError(f"❌ ERROR: Input file not found: {INPUT_FILE}")

df = pd.read_excel(INPUT_FILE)
print(f"✅ Loaded {len(df)} rows from {INPUT_FILE}")

# ========================================
# ENSURE REQUIRED COLUMNS
# ========================================
expected_columns = [
    "Long Name", "Retailer", "Name", "Address",
    "City", "State", "Zip", "Category", "Suppliers"
]
# handle alternate supplier headings
for alt in ["Supplier(s)", "Supplier", "supplier", "supplier(s)"]:
    if alt in df.columns and "Suppliers" not in df.columns:
        df.rename(columns={alt: "Suppliers"}, inplace=True)

for col in expected_columns:
    if col not in df.columns:
        df[col] = ""

if "Latitude" not in df.columns:
    df["Latitude"] = None
if "Longitude" not in df.columns:
    df["Longitude"] = None

# ========================================
# SUPPLIER NORMALIZATION
# ========================================
def normalize_suppliers(val):
    """Standardize supplier strings to a consistent comma-separated list."""
    if pd.isna(val):
        return ""
    if isinstance(val, (list, tuple)):
        vals = [str(x).strip() for x in val if str(x).strip()]
    else:
        s = str(val)
        s = re.sub(r"[;/|]", ",", s)
        vals = [x.strip() for x in s.split(",") if x.strip()]
    return ", ".join(sorted(set(vals), key=str.lower))

df["Suppliers"] = df["Suppliers"].apply(normalize_suppliers)

# ========================================
# LOAD CACHE
# ========================================
if CACHE_FILE.exists():
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        cache = json.load(f)
    print(f"📂 Loaded existing cache: {len(cache):,} entries")
else:
    cache = {}
    print("🆕 No existing cache found — starting fresh.")

# ========================================
# ADDRESS NORMALIZER
# ========================================
def normalize_address(addr: str) -> str:
    addr = str(addr).lower().strip()
    addr = re.sub(r"[^a-z0-9\s,]", "", addr)
    addr = re.sub(r"\s+", " ", addr)
    return addr.strip()

# ========================================
# GEOCODING FUNCTION
# ========================================
new_hits = 0
cached_hits = 0

def geocode_address(address: str):
    global new_hits, cached_hits
    if not address.strip():
        return None, None

    key = normalize_address(address)
    if key in cache:
        cached_hits += 1
        return cache[key]

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(address)}.json"
    params = {
        "access_token": MAPBOX_TOKEN,
        "limit": 1,
        "country": "US",
        "types": "address,poi",
        "proximity": "-96.5,42.5"
    }

    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("features"):
            lon, lat = data["features"][0]["geometry"]["coordinates"]
            cache[key] = (lat, lon)
            new_hits += 1
            return lat, lon
        else:
            print(f"⚠️ No result for: {address}")
            cache[key] = (None, None)
            return None, None
    except Exception as e:
        print(f"❌ Error geocoding '{address}': {e}")
        cache[key] = (None, None)
        return None, None

# ========================================
# MAIN GEOCODING LOOP
# ========================================
print("🧭 Beginning geocoding process...")

for i, row in df.iterrows():
    if pd.notna(row["Latitude"]) and pd.notna(row["Longitude"]):
        continue

    full_address = f"{row['Address']}, {row['City']}, {row['State']} {row['Zip']}".strip()
    lat, lon = geocode_address(full_address)
    df.at[i, "Latitude"] = lat
    df.at[i, "Longitude"] = lon

    if (i + 1) % 25 == 0:
        print(f"Processed {i + 1}/{len(df)} rows...")
    sleep(RATE_LIMIT_DELAY)

# ========================================
# SAVE CACHE
# ========================================
with open(CACHE_FILE, "w", encoding="utf-8") as f:
    json.dump(cache, f, indent=2)
print(f"💾 Updated geocode cache saved: {CACHE_FILE}")

# ========================================
# ROUND COORDINATES
# ========================================
df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce").round(6)
df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce").round(6)

# ========================================
# SAVE EXCEL
# ========================================
df.to_excel(OUTPUT_XLSX, index=False)
print(f"✅ Geocoding complete! {len(df)} rows saved to {OUTPUT_XLSX}")
print(f"🔁 Cached hits: {cached_hits:,} | 🆕 New lookups: {new_hits:,}")

# ========================================
# EXPORT GEOJSON
# ========================================
print("🌎 Exporting to GeoJSON...")

features = []
for _, r in df.iterrows():
    lat, lon = r.get("Latitude"), r.get("Longitude")
    if pd.isna(lat) or pd.isna(lon):
        continue

    props = {col: str(r.get(col, "")).strip() for col in expected_columns}
    feat = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [round(float(lon), 6), round(float(lat), 6)]
        },
        "properties": props
    }
    features.append(feat)

geojson = {"type": "FeatureCollection", "features": features}
with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2)

print(f"✅ Exported {len(features)} features to {OUTPUT_GEOJSON}")
print("🏁 Supplier normalization + precision export complete!")
