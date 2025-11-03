# ========================================
# geocode_retailers.py
# Certis AgRoute Planner — Phase A.6 Supplier Integrity & Completeness Patch
# ========================================
# Reads retailers.xlsx from /data, geocodes addresses using Mapbox,
# caches results, and writes retailers_latlong.xlsx + retailers.geojson
# with verified Supplier metadata and 6-decimal precision.
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
for col in expected_columns:
    if col not in df.columns:
        df[col] = ""

if "Latitude" not in df.columns:
    df["Latitude"] = None
if "Longitude" not in df.columns:
    df["Longitude"] = None

# ========================================
# LOAD CACHE (avoid duplicate lookups)
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
    """Return (lat, lon) tuple from Mapbox or cache."""
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
        "proximity": "-96.5,42.5"  # Bias to Midwest region
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
    full_address = f"{row['Address']}, {row['City']}, {row['State']} {row['Zip']}".strip()
    if not full_address or full_address.lower() == "nan":
        print(f"⚠️ Row {i}: Missing address data — skipping.")
        continue

    lat = row.get("Latitude")
    lon = row.get("Longitude")
    if pd.notna(lat) and pd.notna(lon):
        continue  # already geocoded

    lat, lon = geocode_address(full_address)
    df.at[i, "Latitude"] = lat
    df.at[i, "Longitude"] = lon

    if (i + 1) % 25 == 0:
        print(f"Processed {i + 1}/{len(df)} rows...")
    sleep(RATE_LIMIT_DELAY)

# ========================================
# SAVE UPDATED CACHE
# ========================================
with open(CACHE_FILE, "w", encoding="utf-8") as f:
    json.dump(cache, f, indent=2)
print(f"💾 Updated geocode cache saved: {CACHE_FILE}")

# ========================================
# ROUND COORDINATES FOR CONSISTENCY
# ========================================
df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce").round(6)
df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce").round(6)

# ========================================
# SAVE EXCEL OUTPUT
# ========================================
df.to_excel(OUTPUT_XLSX, index=False)
print(f"✅ Geocoding complete! {len(df)} rows saved to {OUTPUT_XLSX}")
print(f"🔁 Cached hits: {cached_hits:,} | 🆕 New lookups: {new_hits:,}")

# ========================================
# EXPORT TO GEOJSON (for Mapbox)
# ========================================
print("🌎 Exporting to GeoJSON...")

features = []
for _, r in df.iterrows():
    lat, lon = r.get("Latitude"), r.get("Longitude")
    if pd.isna(lat) or pd.isna(lon):
        print(f"⚠️ Missing coordinates for {r.get('Retailer', '')} – {r.get('Name', '')}")
        continue

    suppliers_raw = r.get("Suppliers", "")
    if pd.isna(suppliers_raw) or str(suppliers_raw).strip() == "":
        suppliers_raw = "None listed"

    props = {
        "Long Name": r.get("Long Name", ""),
        "Retailer": r.get("Retailer", ""),
        "Name": r.get("Name", ""),
        "Address": r.get("Address", ""),
        "City": r.get("City", ""),
        "State": r.get("State", ""),
        "Zip": str(r.get("Zip", "")),
        "Category": r.get("Category", ""),
        "Suppliers": str(suppliers_raw).strip()
    }

    features.append({
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [round(float(lon), 6), round(float(lat), 6)]
        },
        "properties": props
    })

geojson = {"type": "FeatureCollection", "features": features}

with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2, ensure_ascii=False)

print(f"✅ Exported {len(features)} features to {OUTPUT_GEOJSON}")
print("🏁 All data regeneration steps complete with 6-decimal precision and supplier integrity!")
