import os
import pandas as pd
import requests
from dotenv import load_dotenv

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FILE = os.path.join(BASE_DIR, "data", "retailers.xlsx")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "retailers_latlong.xlsx")

# Load environment variables from .env.local
dotenv_path = os.path.join(BASE_DIR, ".env.local")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

MAPBOX_TOKEN = os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN")

# Fallback to public/mapbox-token.txt
if not MAPBOX_TOKEN:
    token_file = os.path.join(BASE_DIR, "public", "mapbox-token.txt")
    if os.path.exists(token_file):
        with open(token_file, "r") as f:
            MAPBOX_TOKEN = f.read().strip()

if not MAPBOX_TOKEN:
    raise RuntimeError("❌ No Mapbox token found. Please check .env.local or public/mapbox-token.txt")

print("📂 Loading retailer Excel file...")
df = pd.read_excel(INPUT_FILE)

# Ensure lat/long columns
if "Latitude" not in df.columns:
    df["Latitude"] = None
if "Longitude" not in df.columns:
    df["Longitude"] = None

def geocode(address):
    """Geocode using Mapbox API"""
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{address}.json"
    params = {"access_token": MAPBOX_TOKEN, "limit": 1}
    response = requests.get(url, params=params, timeout=5)
    response.raise_for_status()
    data = response.json()
    if data["features"]:
        lon, lat = data["features"][0]["center"]
        return lat, lon
    return None, None

# Process each row
for idx, row in df.iterrows():
    if pd.notna(row.get("Latitude")) and pd.notna(row.get("Longitude")):
        continue  # already filled

    address_parts = [str(row.get(c, "")) for c in ["Address", "City", "State", "Zip"] if pd.notna(row.get(c))]
    address = " ".join(address_parts).strip()

    if not address:
        print(f"⚠️ Skipping row {idx}, no address")
        continue

    try:
        print(f"📍 {idx+1}/{len(df)}: Geocoding '{address}'...")
        lat, lon = geocode(address)
        df.at[idx, "Latitude"] = lat
        df.at[idx, "Longitude"] = lon
    except Exception as e:
        print(f"⚠️ Failed to geocode '{address}': {e}")

print(f"💾 Saving results to {OUTPUT_FILE} ...")
df.to_excel(OUTPUT_FILE, index=False)
print("✅ Done! Geocoded file created.")
