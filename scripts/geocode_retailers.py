import pandas as pd
import requests
import time
from pathlib import Path
import json

DATA_DIR = Path("data")
INFILE = DATA_DIR / "retailers.xlsx"
OUTFILE = DATA_DIR / "retailers_latlong.xlsx"
CACHE_FILE = DATA_DIR / "geocode_cache.csv"
TOKEN_FILE = DATA_DIR / "mapbox_token.json"

# Load token from JSON
token = json.loads(TOKEN_FILE.read_text())["token"]

df = pd.read_excel(INFILE, dtype=str).fillna("")

# Load or init cache
if CACHE_FILE.exists():
    cache = pd.read_csv(CACHE_FILE, dtype=str).fillna("")
else:
    cache = pd.DataFrame(columns=["query", "lat", "lon"])

def lookup(q):
    m = cache.loc[cache["query"] == q]
    if len(m) == 1:
        return float(m.iloc[0]["lat"]), float(m.iloc[0]["lon"])
    return None

def update(q, lat, lon):
    global cache
    cache.loc[len(cache.index)] = [q, lat, lon]
    cache.to_csv(CACHE_FILE, index=False)

def geocode(addr):
    cached = lookup(addr)
    if cached:
        return cached

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{addr}.json"
    r = requests.get(url, params={"access_token": token, "limit": 1})
    js = r.json()
    feats = js.get("features", [])
    if feats:
        lon, lat = feats[0]["center"]
        update(addr, lat, lon)
        return lat, lon
    return None

rows = []
for i, row in df.iterrows():
    print(f"   • Processed {i}/{len(df)}", end="\r")

    addr = f"{row['Address']}, {row['City']}, {row['State']} {row['Zip']}"
    g = geocode(addr)
    if not g:
        rows.append({**row, "Latitude": "", "Longitude": ""})
        continue

    lat, lon = g
    rows.append({**row, "Latitude": lat, "Longitude": lon})
    time.sleep(0.12)

out = pd.DataFrame(rows)
out.to_excel(OUTFILE, index=False)
print(f"\n\n✅ Exported geocoded retailers → {OUTFILE}")
