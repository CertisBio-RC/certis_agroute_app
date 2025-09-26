# scripts/geocode_retailers.py

import os
import sys
import pandas as pd
import requests
import subprocess

# Config
INPUT_XLSX = os.path.join("data", "retailers.xlsx")
OUTPUT_XLSX = os.path.join("data", "retailers_latlong.xlsx")
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN") or os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN")
CONVERTER_SCRIPT = os.path.join("scripts", "convert_to_geojson.py")

if not MAPBOX_TOKEN:
    print("❌ ERROR: Missing MAPBOX_TOKEN environment variable.")
    sys.exit(1)

def geocode_address(address: str):
    """Use Mapbox Geocoding API to get lat/long for a given address."""
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{address}.json"
    params = {"access_token": MAPBOX_TOKEN, "limit": 1}
    try:
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        if data["features"]:
            lon, lat = data["features"][0]["center"]
            return lat, lon
    except Exception as e:
        print(f"⚠️ Geocoding failed for '{address}': {e}")
    return None, None

def main():
    print("📂 Loading retailer Excel file...")
    if not os.path.exists(INPUT_XLSX):
        print(f"❌ ERROR: Input file not found: {INPUT_XLSX}")
        sys.exit(1)

    df = pd.read_excel(INPUT_XLSX)

    # Ensure Latitude/Longitude columns exist (wipe old data if present)
    df["Latitude"] = None
    df["Longitude"] = None

    # Geocode each row
    for idx, row in df.iterrows():
        address_parts = [str(row.get(col, "")) for col in ["Address", "City", "State", "Zip"] if pd.notna(row.get(col))]
        address = ", ".join(address_parts)
        if not address.strip():
            continue

        lat, lon = geocode_address(address)
        if lat and lon:
            df.at[idx, "Latitude"] = lat
            df.at[idx, "Longitude"] = lon

    # Save updated Excel
    print(f"💾 Saving results to {OUTPUT_XLSX} ...")
    df.to_excel(OUTPUT_XLSX, index=False)

    print("✅ Done! Geocoded file created.")

    # --- Auto-run convert_to_geojson.py ---
    print("🔄 Converting to GeoJSON...")
    try:
        subprocess.run([sys.executable, CONVERTER_SCRIPT], check=True)
    except Exception as e:
        print(f"❌ ERROR: Failed to run {CONVERTER_SCRIPT}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
