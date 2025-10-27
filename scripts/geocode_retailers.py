# ========================================
# geocode_retailers.py
# ========================================
# Reads retailers.xlsx from /data, geocodes missing coordinates using Mapbox,
# caches results to avoid redundant lookups, and writes
# retailers_latlong.xlsx back into /data.
# ========================================

import os
import json
import pandas as pd
import requests
from time import sleep
from pathlib import Path
import re

# ========================================
# CONFIGURATION
# ========================================
DATA_DIR = Path("../data")
INPUT_FILE = DATA_DIR / "retailers.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers_latlong.xlsx"
CACHE_FILE = DATA_DIR / "geocode_cache.json"

# ✅ Hardwired Mapbox token (John Bailey’s project)
MAPBOX_TOKEN = "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21mempnNTBmMDNibjJtb2ZycTJycDB6YyJ9.9LIIYF2Bwn_aRSsuOBSI3g"

# Mapbox recommends <600 requests/minute — this keeps us safe
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
# CLEANUP & COLUMN NORMALIZATION
# ========================================
expected_columns = [
    "Retailer",
    "Name",
    "Address",
    "City",
    "State",
    "Zip",
    "Category",
    "Suppliers",
]

for col in expected_columns:
    if col not in df.columns:
        df[col] = ""

# Ensure Latitude and Longitude exist
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
    """Lowercase, remove punctuation and compress whitespace."""
    addr = str(addr).lower().strip()
    addr = re.sub(r"[^a-z0-9\s,]", "", addr)  # remove punctuation
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

    # Check cache first
    if key in cache:
        cached_hits += 1
        return cache[key]

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(address)}.json"
    params = {"access_token": MAPBOX_TOKEN, "limit": 1, "country": "US"}

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if "features" in data and data["features"]:
            coords = data["features"][0]["geometry"]["coordinates"]
            lon, lat = coords[0], coords[1]
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
    # Skip already geocoded
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
# SAVE UPDATED CACHE
# ========================================
with open(CACHE_FILE, "w", encoding="utf-8") as f:
    json.dump(cache, f, indent=2)
print(f"💾 Updated geocode cache saved: {CACHE_FILE}")

# ========================================
# EXPORT FINAL DATASET
# ========================================
df.to_excel(OUTPUT_FILE, index=False)
print(f"✅ Geocoding complete! {len(df)} rows saved to {OUTPUT_FILE}")
print(f"🔁 Cached hits: {cached_hits:,} | 🆕 New lookups: {new_hits:,}")
