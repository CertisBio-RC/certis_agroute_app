# ========================================
# convert_to_geojson.py
# Certis AgRoute Planner — Phase E.0
# KINGPIN1 Autogeocoding + Supplier Exact Preservation
# Unified GeoJSON Export
# ========================================
# Converts:
#   • retailers_latlong.xlsx     (normal retailers, already geocoded)
#   • kingpin1_COMBINED.xlsx     (Tier-1 Key Accounts, geocoded here)
#
# Produces:
#   • retailers.geojson (merged + cleaned)
#
# Supports:
#   • Supplier EXACT preservation
#   • KINGPIN1 autogeocoding (Address + City + State + Zip)
#   • Shared geocode cache (geocode_cache.csv)
#   • Category normalization
#   • KINGPIN suppressed where KINGPIN1 exists
#   • Unified FeatureCollection merge
# ========================================

import pandas as pd
import json
import re
import os
import requests
import time
from pathlib import Path

# ----------------------------------------
# PATHS
# ----------------------------------------
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

RETAILERS_LATLONG_FILE = DATA_DIR / "retailers_latlong.xlsx"
KINGPIN1_FILE = DATA_DIR / "kingpin1_COMBINED.xlsx"
CACHE_FILE = DATA_DIR / "geocode_cache.csv"

OUTPUT_FILE = DATA_DIR / "retailers.geojson"
SUMMARY_FILE = DATA_DIR / "geojson_summary.txt"

# ----------------------------------------
# LOAD MAPBOX TOKEN
# ----------------------------------------
MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN", None)
if MAPBOX_TOKEN is None:
    raise EnvironmentError("❌ MAPBOX_TOKEN not found in environment variables.")


# ----------------------------------------
# LOAD RETAILERS (already geocoded)
# ----------------------------------------
print("📥 Loading standard retailer data...")

if not RETAILERS_LATLONG_FILE.exists():
    raise FileNotFoundError(f"❌ Missing: {RETAILERS_LATLONG_FILE}")

df_retail = pd.read_excel(RETAILERS_LATLONG_FILE, dtype=str).fillna("")
df_retail.columns = [str(c).strip() for c in df_retail.columns]

print(f"✔ Loaded {len(df_retail)} standard retailers")


# ----------------------------------------
# LOAD KINGPIN1 (must be geocoded inside this script)
# ----------------------------------------
print("📥 Loading KINGPIN1 Tier-1 Key Accounts...")

if not KINGPIN1_FILE.exists():
    raise FileNotFoundError(f"❌ Missing KINGPIN1 file: {KINGPIN1_FILE}")

df_kp1 = pd.read_excel(KINGPIN1_FILE, dtype=str).fillna("")
df_kp1.columns = [str(c).strip() for c in df_kp1.columns]

print(f"✔ Loaded {len(df_kp1)} KINGPIN1 locations")

required_kp1 = ["Address", "City", "State", "Zip"]
missing = [c for c in required_kp1 if c not in df_kp1.columns]
if missing:
    raise ValueError(f"❌ Missing KINGPIN1 address fields: {missing}")


# ----------------------------------------
# LOAD / INIT GEOCODE CACHE
# ----------------------------------------
if CACHE_FILE.exists():
    cache_df = pd.read_csv(CACHE_FILE, dtype=str).fillna("")
else:
    cache_df = pd.DataFrame(columns=["query", "lat", "lon"])

def lookup_cache(query: str):
    r = cache_df.loc[cache_df["query"] == query]
    if len(r) == 1:
        return float(r["lat"].values[0]), float(r["lon"].values[0])
    return None

def update_cache(query: str, lat: float, lon: float):
    global cache_df
    cache_df.loc[len(cache_df.index)] = [query, lat, lon]
    cache_df.to_csv(CACHE_FILE, index=False)


# ----------------------------------------
# MAPBOX GEOCODE FUNCTION
# ----------------------------------------
def geocode_address(addr: str):
    """Shared geocode function using cache + Mapbox + retry logic."""
    cached = lookup_cache(addr)
    if cached:
        return cached

    url = (
        f"https://api.mapbox.com/geocoding/v5/mapbox.places/"
        f"{requests.utils.quote(addr)}.json?access_token={MAPBOX_TOKEN}&limit=1"
    )

    for attempt in range(3):
        try:
            r = requests.get(url, timeout=8)
            if r.status_code == 200:
                data = r.json()
                feats = data.get("features", [])
                if len(feats) > 0:
                    lon, lat = feats[0]["center"]
                    update_cache(addr, lat, lon)
                    return lat, lon
        except:
            time.sleep(1)

    return None


# ----------------------------------------
# CLEANING HELPERS
# ----------------------------------------
POBOX_REGEX = re.compile(
    r"\b(p[\.\s]*o[\.\s]*\s*box|^box\s*\d+|rural\s*route|rr\s*\d+|hc\s*\d+|general\s*delivery)\b",
    re.IGNORECASE,
)

def clean_address(address: str) -> str:
    if not isinstance(address, str):
        return ""
    cleaned = re.sub(POBOX_REGEX, "", address)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.replace(" ,", ",").strip()

def preserve_suppliers(value):
    """Absolute byte-level preservation."""
    if value is None:
        return ""
    return str(value)


# ----------------------------------------
# CATEGORY NORMALIZATION
# ----------------------------------------
def normalize_categories(raw: str):
    if not raw:
        return ["Agronomy"]

    parts = re.split(r"[,;/|]+", raw)
    cats = [p.strip().lower() for p in parts if p.strip()]

    normalized = []

    for c in cats:
        if c in ["kingpin1", "kingpin 1", "tier1", "tier 1", "kp1"]:
            normalized.append("Kingpin1")
        elif c == "kingpin":
            normalized.append("Kingpin")
        elif c.startswith("agronomy") or c in ["ag retail"]:
            normalized.append("Agronomy")
        elif c in ["grain", "feed", "grain/feed", "grain & feed"]:
            normalized.append("Grain/Feed")
        elif "distribution" in c:
            normalized.append("Distribution")
        elif c in ["office", "office/service", "c-store", "cstore", "energy", "service"]:
            normalized.append("C-Store/Service/Energy")
        else:
            normalized.append("Agronomy")

    order = [
        "Kingpin1",
        "Kingpin",
        "Agronomy",
        "Grain/Feed",
        "Distribution",
        "C-Store/Service/Energy",
    ]

    return sorted(set(normalized), key=lambda x: order.index(x))

def apply_category_logic(cat_list):
    if "Kingpin1" in cat_list:
        return [c for c in cat_list if c != "Kingpin"]
    return cat_list


# ----------------------------------------
# BUILD NORMAL RETAILER FEATURE
# ----------------------------------------
def build_retailer(row):
    try:
        lat = float(row.get("Latitude") or 0)
        lon = float(row.get("Longitude") or 0)

        if lat == 0 or lon == 0:
            return None

        cats = normalize_categories(row.get("Category", ""))
        cats = apply_category_logic(cats)

        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": {
                "Long Name": str(row.get("Long Name", "")),
                "Retailer": str(row.get("Retailer", "")),
                "Name": str(row.get("Name", "")),
                "Address": clean_address(str(row.get("Address", ""))),
                "City": str(row.get("City", "")),
                "State": str(row.get("State", "")),
                "Zip": str(row.get("Zip", "")),
                "Suppliers": preserve_suppliers(row.get("Suppliers", "")),
                "Categories": cats,
            },
        }
    except:
        return None


# ----------------------------------------
# BUILD KINGPIN1 FEATURE (geocoded here)
# ----------------------------------------
def build_kp1(row):
    addr = clean_address(str(row.get("Address", "")))
    city = str(row.get("City", ""))
    state = str(row.get("State", ""))
    zipcode = str(row.get("Zip", ""))

    query = f"{addr}, {city}, {state} {zipcode}".strip()

    geocode = geocode_address(query)
    if not geocode:
        return None

    lat, lon = geocode

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
        "properties": {
            "Long Name": str(row.get("Long Name", "")),
            "Retailer": str(row.get("Retailer", "")),
            "Name": str(row.get("Name", "")),
            "Address": addr,
            "City": city,
            "State": state,
            "Zip": zipcode,
            "Suppliers": preserve_suppliers(row.get("Suppliers", "")),
            "Categories": ["Kingpin1"],
        },
    }


# ----------------------------------------
# BUILD COMPLETE DATASET
# ----------------------------------------
features = []

print("🧭 Building retailer features...")
invalid_retail = 0

for _, row in df_retail.iterrows():
    f = build_retailer(row)
    if f:
        features.append(f)
    else:
        invalid_retail += 1


print("⭐ Injecting KINGPIN1 features...")
kp1_count = 0
kp1_invalid = 0

for _, row in df_kp1.iterrows():
    f = build_kp1(row)
    if f:
        features.append(f)
        kp1_count += 1
    else:
        kp1_invalid += 1


# ----------------------------------------
# EXPORT GEOJSON
# ----------------------------------------
geojson = {"type": "FeatureCollection", "features": features}

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2, ensure_ascii=False)


# ----------------------------------------
# SUMMARY FILE
# ----------------------------------------
summary = (
    "📊 GEOJSON BUILD SUMMARY\n"
    "------------------------------------\n"
    f"Standard retailer rows:       {len(df_retail)}\n"
    f"Valid retailer features:      {len(df_retail) - invalid_retail}\n"
    f"Invalid retailer coords:      {invalid_retail}\n"
    f"KINGPIN1 rows:                {len(df_kp1)}\n"
    f"Valid KINGPIN1 features:      {kp1_count}\n"
    f"Invalid KINGPIN1 coords:      {kp1_invalid}\n"
    f"TOTAL FEATURES WRITTEN:       {len(features)}\n"
    f"Output file:                  {OUTPUT_FILE.name}\n"
)

with open(SUMMARY_FILE, "w", encoding="utf-8") as s:
    s.write(summary)

print(f"✅ GeoJSON created → {OUTPUT_FILE}")
print(f"📄 Summary logged → {SUMMARY_FILE}")
print("🏁 Phase E.0 complete — KINGPIN1 autogeocoded + unified dataset.")
