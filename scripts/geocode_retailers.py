# ========================================
# geocode_retailers.py
# Certis AgRoute Planner — Phase B: Coordinate Integrity Validation + Auto Public Sync
# ========================================
# Adds automatic sanity checks, east-coast filters, anomaly reporting,
# and now automatically syncs retailers.geojson to /public/data.
# ========================================

import json
import pandas as pd
import requests
from time import sleep
from pathlib import Path
import re
import tempfile
import os

# ========================================
# CONFIGURATION
# ========================================
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PUBLIC_DATA_DIR = BASE_DIR / "public" / "data"

INPUT_FILE = DATA_DIR / "retailers.xlsx"
OUTPUT_XLSX = DATA_DIR / "retailers_latlong.xlsx"
OUTPUT_GEOJSON = DATA_DIR / "retailers.geojson"
OUTPUT_GEOJSON_PUBLIC = PUBLIC_DATA_DIR / "retailers.geojson"
CACHE_FILE = DATA_DIR / "geocode_cache.json"
ANOMALY_FILE = DATA_DIR / "geocode_anomalies.xlsx"

MAPBOX_TOKEN = "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21mempnNTBmMDNibjJtb2ZycTJycDB6YyJ9.9LIIYF2Bwn_aRSsuOBSI3g"
RATE_LIMIT_DELAY = 0.25  # seconds
MIDWEST_BIAS = "-96.5,42.5"

# ========================================
# LOAD DATA
# ========================================
print(f"📥 Loading retailer Excel file: {INPUT_FILE}")

if not INPUT_FILE.exists():
    raise FileNotFoundError(f"❌ ERROR: Input file not found: {INPUT_FILE}")

df = pd.read_excel(INPUT_FILE)
print(f"✅ Loaded {len(df)} rows from {INPUT_FILE}")

# Ensure required columns
expected_columns = [
    "Long Name", "Retailer", "Name", "Address", "City",
    "State", "Zip", "Category", "Suppliers"
]
for col in expected_columns:
    if col not in df.columns:
        df[col] = ""

for c in ["Latitude", "Longitude"]:
    if c not in df.columns:
        df[c] = None

# ========================================
# LOAD CACHE
# ========================================
if CACHE_FILE.exists():
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        cache = json.load(f)
    print(f"📂 Loaded cache: {len(cache):,} entries")
else:
    cache = {}
    print("🆕 Starting new cache...")

# ========================================
# HELPERS
# ========================================
def normalize_address(addr: str) -> str:
    addr = str(addr).lower().strip()
    addr = re.sub(r"[^a-z0-9\s,]", "", addr)
    addr = re.sub(r"\s+", " ", addr)
    return addr.strip()

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
        "proximity": MIDWEST_BIAS,
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
            cache[key] = (None, None)
            return None, None
    except Exception as e:
        print(f"❌ Error geocoding '{address}': {e}")
        cache[key] = (None, None)
        return None, None

# ========================================
# MAIN LOOP
# ========================================
print("🧭 Beginning geocoding process...")
for i, row in df.iterrows():
    if pd.notna(row.get("Latitude")) and pd.notna(row.get("Longitude")):
        continue
    full_address = f"{row['Address']}, {row['City']}, {row['State']} {row['Zip']}".strip()
    if not full_address or full_address.lower() == "nan":
        continue
    lat, lon = geocode_address(full_address)
    df.at[i, "Latitude"] = lat
    df.at[i, "Longitude"] = lon
    if (i + 1) % 25 == 0:
        print(f"   • Processed {i + 1}/{len(df)}")
    sleep(RATE_LIMIT_DELAY)

# ========================================
# SAVE CACHE (atomic write)
# ========================================
tmpfile = tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8")
json.dump(cache, tmpfile, indent=2)
tmpfile.close()
os.replace(tmpfile.name, CACHE_FILE)
print(f"💾 Cache updated ({len(cache):,} entries)")

# ========================================
# ROUND + SANITY CHECKS
# ========================================
df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce").round(6)
df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce").round(6)

suspects = []

for i, r in df.iterrows():
    lat, lon = r["Latitude"], r["Longitude"]
    if pd.isna(lat) or pd.isna(lon):
        reason = "Missing coordinates"
    elif lat < 20 or lat > 50:
        reason = "Latitude out of US bounds"
    elif lon > -50 or lon < -130:
        reason = "Longitude out of US bounds"
    elif lon > -80:
        reason = "Possible east-coast/geocode error"
    elif lat > 0 and lon > 0:
        reason = "Lat/Lon reversed?"
        df.at[i, "Latitude"], df.at[i, "Longitude"] = lon, lat
    else:
        continue
    suspects.append({**r.to_dict(), "Reason": reason})

if suspects:
    pd.DataFrame(suspects).to_excel(ANOMALY_FILE, index=False)
    print(f"⚠️  {len(suspects)} suspect coordinates logged to {ANOMALY_FILE}")
else:
    print("✅ Coordinate sanity checks passed cleanly.")

# ========================================
# SAVE EXCEL OUTPUT
# ========================================
df.to_excel(OUTPUT_XLSX, index=False)
print(f"✅ Geocoding complete → {OUTPUT_XLSX}")
print(f"🔁 Cached hits: {cached_hits:,} | 🆕 New lookups: {new_hits:,}")

# ========================================
# EXPORT GEOJSON
# ========================================
print("🌎 Exporting to GeoJSON...")
features = []
for _, r in df.iterrows():
    lat, lon = r["Latitude"], r["Longitude"]
    if pd.isna(lat) or pd.isna(lon):
        continue
    suppliers = str(r.get("Suppliers", "") or "None listed").strip()
    props = {
        "Long Name": r.get("Long Name", ""),
        "Retailer": r.get("Retailer", ""),
        "Name": r.get("Name", ""),
        "Address": r.get("Address", ""),
        "City": r.get("City", ""),
        "State": r.get("State", ""),
        "Zip": str(r.get("Zip", "")),
        "Category": r.get("Category", ""),
        "Suppliers": suppliers,
    }
    features.append({
        "type": "Feature",
        "geometry": {"type": "Point",
                     "coordinates": [round(float(lon), 6), round(float(lat), 6)]},
        "properties": props,
    })

geojson = {"type": "FeatureCollection", "features": features}

# Save primary GeoJSON
with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2, ensure_ascii=False)
print(f"✅ Exported {len(features)} features → {OUTPUT_GEOJSON}")

# Also export live copy to /public/data
try:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_GEOJSON_PUBLIC, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)
    print(f"🌍 Synced public dataset → {OUTPUT_GEOJSON_PUBLIC}")
except Exception as e:
    print(f"⚠️  Failed to write public copy: {e}")

print("🏁 Phase B complete — coordinates validated, anomalies logged, and data exported.")
