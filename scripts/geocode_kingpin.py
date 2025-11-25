# scripts/geocode_kingpin.py

import pandas as pd
import requests
import json
import time
import os

INPUT_FILE = os.path.join("data", "kingpin1_COMBINED.xlsx")
OUTPUT_FILE = os.path.join("data", "kingpin_latlong.xlsx")
TOKEN_FILE = os.path.join("data", "token.json")


def load_token():
    with open(TOKEN_FILE, "r", encoding="utf-8-sig") as f:
        return json.load(f)["MAPBOX_TOKEN"]


def geocode(address, token):
    url = f"https://api.mapbox.com/search/geocode/v6/forward?q={address}&access_token={token}"
    r = requests.get(url).json()

    try:
        coord = r["features"][0]["geometry"]["coordinates"]
        return coord[0], coord[1]
    except:
        return None, None


def main():
    print(f"[geocode_kingpin] Loading: {INPUT_FILE}")
    df = pd.read_excel(INPUT_FILE)

    token = load_token()

    lons = []
    lats = []

    for _, row in df.iterrows():
        address = f"{row['ADDRESS']}, {row['CITY']}, {row['STATE']} {row['ZIP CODE']}"
        lng, lat = geocode(address, token)
        lons.append(lng)
        lats.append(lat)
        time.sleep(0.15)

    df["Longitude"] = lons
    df["Latitude"] = lats
    df.to_excel(OUTPUT_FILE, index=False)

    print(f"[OK] Saved → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
