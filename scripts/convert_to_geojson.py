import pandas as pd
import json
import os
import requests

# ================================
# 📂 Input / Output file paths
# ================================
INPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join("data", "retailers.geojson")
CACHE_FILE = os.path.join("data", "geocode-cache.json")

# 🔑 Load Geocodio API key
GEOCODIO_KEY = os.environ.get("GEOCODIO_API_KEY")


def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def geocode_address(address, cache):
    """Return (lat, lon) for an address, using cache + Geocodio API if needed."""
    if address in cache:
        return cache[address]

    if not GEOCODIO_KEY:
        print(f"❌ Missing GEOCODIO_API_KEY. Cannot geocode: {address}")
        return None

    url = f"https://api.geocod.io/v1.7/geocode?q={address}&api_key={GEOCODIO_KEY}"
    resp = requests.get(url)
    if resp.status_code != 200:
        print(f"⚠️ Geocode failed for {address}: {resp.text}")
        return None

    data = resp.json()
    if "results" not in data or not data["results"]:
        print(f"⚠️ No geocode result for {address}")
        return None

    lat = data["results"][0]["location"]["lat"]
    lon = data["results"][0]["location"]["lng"]
    cache[address] = [lat, lon]
    return [lat, lon]


def main():
    print("📂 Loading Excel with lat/long...")
    df = pd.read_excel(INPUT_FILE)

    required_cols = {"Name", "Address"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"❌ Missing required columns: {missing}")

    cache = load_cache()
    features = []
    categories_seen = set()

    for _, row in df.iterrows():
        name = str(row.get("Name", ""))
        address = str(row.get("Address", ""))
        lat = row.get("Latitude")
        lon = row.get("Longitude")
        category = str(row.get("Category", "")).strip()

        if category:
            categories_seen.add(category)

        # ✅ If lat/lon already exist → use them
        if pd.notna(lat) and pd.notna(lon):
            lat, lon = float(lat), float(lon)
        else:
            # 🌍 Geocode missing coordinates
            coords = geocode_address(address, cache)
            if coords:
                lat, lon = coords
            else:
                print(f"⚠️ Skipping {name} (no coordinates)")
                continue

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],  # ✅ GeoJSON = [lon, lat]
            },
            "properties": {
                "name": name,
                "address": address,
                "category": category,  # ✅ forced lowercase key
            },
        }
        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    save_cache(cache)
    print(f"✅ Wrote {len(features)} features to {OUTPUT_FILE}")
    print("📊 Categories found:", sorted(categories_seen))


if __name__ == "__main__":
    main()
