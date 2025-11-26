# scripts/geocode_kingpin.py
import pandas as pd
import requests
import time
import numpy as np
import os

MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN", "").strip()

INPUT_FILE = "data/kingpin1_COMBINED.xlsx"
OUTPUT_FILE = "data/kingpin_latlong.xlsx"

def safe(v):
    """Convert NaN → empty string."""
    if pd.isna(v):
        return ""
    return str(v).strip()

def geocode(addr, city, state, zip_code):
    """Return (lon, lat) using Mapbox forward geocoding."""
    if not MAPBOX_TOKEN:
        return (None, None)

    query = f"{addr}, {city}, {state} {zip_code}".strip().replace("  ", " ")

    url = (
        f"https://api.mapbox.com/search/geocode/v6/forward"
        f"?q={requests.utils.quote(query)}"
        f"&access_token={MAPBOX_TOKEN}"
    )

    try:
        r = requests.get(url)
        data = r.json()

        if "features" in data and len(data["features"]) > 0:
            coords = data["features"][0]["geometry"]["coordinates"]
            return (coords[0], coords[1])
    except:
        pass

    return (None, None)


def main():
    print(f"🔵 Loading Kingpin Excel: {INPUT_FILE}")
    df = pd.read_excel(INPUT_FILE)

    # --- Correct column names from your file ---
    ADDRESS_COL = "ADDRESS"
    CITY_COL = "CITY"
    STATE_COL = "STATE.1"
    ZIP_COL = "ZIP CODE"

    df["Address"] = df[ADDRESS_COL].apply(safe)
    df["City"] = df[CITY_COL].apply(safe)
    df["State"] = df[STATE_COL].apply(safe)
    df["Zip"] = df[ZIP_COL].apply(safe)

    lons = []
    lats = []

    print("🔵 Geocoding Kingpins...")
    for _, row in df.iterrows():
        addr = safe(row["Address"])
        city = safe(row["City"])
        state = safe(row["State"])
        zip_code = safe(row["Zip"])

        lon, lat = geocode(addr, city, state, zip_code)
        lons.append(lon)
        lats.append(lat)

        print(f"   • {addr}, {city}, {state} {zip_code} → {lon}, {lat}")
        time.sleep(0.10)

    df["Longitude"] = lons
    df["Latitude"] = lats

    print(f"🔵 Saving to {OUTPUT_FILE}")
    df.to_excel(OUTPUT_FILE, index=False)
    print("✅ Completed.")

if __name__ == "__main__":
    main()
