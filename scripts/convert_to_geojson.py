# scripts/convert_to_geojson.py
"""
Certis AgRoute Planner — Excel → GeoJSON Pipeline
-------------------------------------------------
• Reads retailers_latlong.xlsx
• Geocodes missing lat/longs using Mapbox
• Caches resolved addresses locally
• Writes updated Excel and GeoJSON for Mapbox layer
• Automatically uses embedded Mapbox token if env vars are absent
"""

import os
import sys
import pandas as pd
import json
import requests
import urllib.parse
import math

# ✅ Canonical paths
INPUT_XLSX = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_GEOJSON = os.path.join("public", "data", "retailers.geojson")
CACHE_FILE = os.path.join("data", "geocode_cache.json")

# ✅ Mapbox token (auto-fallback to embedded)
MAPBOX_TOKEN = (
    os.getenv("MAPBOX_TOKEN")
    or os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN")
    or "pk.eyJ1IjoiZG9jamJhaWxleTE5NzEiLCJhIjoiY21mempnNTBmMDNibjJtb2ZycTJycDB6YyJ9.9LIIYF2Bwn_aRSsuOBSI3g"
)

# --- Helper: Geocode a single address ---
def geocode_address(address: str):
    if not MAPBOX_TOKEN:
        raise RuntimeError("❌ ERROR: MAPBOX_TOKEN not set or embedded in script.")

    try:
        encoded_address = urllib.parse.quote(address)
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded_address}.json"
        params = {"access_token": MAPBOX_TOKEN, "limit": 1}
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("features"):
            lon, lat = data["features"][0]["center"]
            return lat, lon
    except Exception as e:
        print(f"⚠️ Geocoding failed for '{address}': {e}")
    return None, None


def main():
    print("📂 Certis AgRoute Planner — Excel → GeoJSON Pipeline (with geocoding)")
    print(f"   Input XLSX: {INPUT_XLSX}")
    print(f"   Output GeoJSON: {OUTPUT_GEOJSON}\n")

    # --- Step 1: Validate input file ---
    if not os.path.exists(INPUT_XLSX):
        print(f"❌ ERROR: Input file not found at {INPUT_XLSX}")
        sys.exit(1)

    # --- Step 2: Load Excel ---
    try:
        df = pd.read_excel(INPUT_XLSX)
    except Exception as e:
        print(f"❌ ERROR: Could not read {INPUT_XLSX}: {e}")
        sys.exit(1)

    # --- Step 3: Ensure coordinate columns ---
    for col in ["Latitude", "Longitude"]:
        if col not in df.columns:
            df[col] = None

    # --- Step 4: Load cache if exists ---
    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            cache = json.load(open(CACHE_FILE, "r", encoding="utf-8"))
            print(f"💾 Loaded {len(cache)} cached addresses.\n")
        except Exception:
            print("⚠️ Cache file unreadable; starting fresh.\n")
            cache = {}

    # --- Step 5: Geocode missing rows ---
    updated = False
    for i, row in df.iterrows():
        lat, lon = row["Latitude"], row["Longitude"]

        if pd.isna(lat) or pd.isna(lon):
            address_parts = [
                str(row.get("Address") or ""),
                str(row.get("City") or ""),
                str(row.get("State") or ""),
                str(row.get("Zip") or ""),
            ]
            full_address = ", ".join([p for p in address_parts if p.strip()])
            if not full_address:
                print(f"⚠️ Row {i}: missing address fields.")
                continue

            if full_address in cache and all(cache[full_address]):
                new_lat, new_lon = cache[full_address]
            else:
                new_lat, new_lon = geocode_address(full_address)
                cache[full_address] = (new_lat, new_lon)

            if new_lat is not None and new_lon is not None:
                df.at[i, "Latitude"] = new_lat
                df.at[i, "Longitude"] = new_lon
                updated = True
                print(f"✅ Geocoded: {full_address} → ({new_lat:.5f}, {new_lon:.5f})")
            else:
                print(f"⚠️ Could not geocode: {full_address}")

    # --- Step 6: Save Excel and cache ---
    if updated:
        try:
            df.to_excel(INPUT_XLSX, index=False)
            print(f"\n💾 Updated Excel saved: {INPUT_XLSX}")
        except Exception as e:
            print(f"⚠️ WARNING: Could not save updated Excel: {e}")

    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
        print(f"💾 Geocode cache written ({len(cache)} entries).")
    except Exception as e:
        print(f"⚠️ WARNING: Could not save cache: {e}")

    # --- Step 7: Convert to GeoJSON ---
    features = []
    for _, row in df.iterrows():
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
            if math.isnan(lat) or math.isnan(lon):
                continue
        except (ValueError, TypeError):
            continue

        properties = {
            "Retailer": row.get("Retailer"),
            "Long Name": row.get("Long Name"),
            "Name": row.get("Site Name") or row.get("Name"),
            "Address": row.get("Address"),
            "City": row.get("City"),
            "State": row.get("State"),
            "Zip": row.get("Zip"),
            "Category": row.get("Category"),
            "Suppliers": row.get("Suppliers"),
        }

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {k: (v if pd.notna(v) else None) for k, v in properties.items()},
        })

    geojson = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(OUTPUT_GEOJSON), exist_ok=True)
    with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    # --- Step 8: Summary ---
    success = len(features)
    missing = len(df[df["Latitude"].isna() | df["Longitude"].isna()])
    print(f"\n✅ Successfully created {OUTPUT_GEOJSON} with {success} features.")
    print(f"🎯 {success} valid coordinates exported.")
    if missing:
        print(f"⚠️ {missing} rows missing coordinates (check Excel).")

    if features:
        print("\n🔎 Example feature:")
        print(json.dumps(features[0]["properties"], indent=2))


if __name__ == "__main__":
    main()
