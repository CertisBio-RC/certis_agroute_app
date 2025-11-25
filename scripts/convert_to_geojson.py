import pandas as pd
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PUBLIC = ROOT / "public" / "data"

INFILE = DATA / "retailers_latlong.xlsx"
OUTFILE = PUBLIC / "retailers.geojson"

df = pd.read_excel(INFILE, dtype=str).fillna("")

def normalize(raw):
    if not raw:
        return ["Agronomy"]

    raw = str(raw).lower()
    if raw in ["grain", "feed", "grain/feed"]:
        return ["Grain/Feed"]
    if raw in ["distribution"]:
        return ["Distribution"]
    if raw in ["office", "service", "energy", "c-store"]:
        return ["C-Store/Service/Energy"]
    if raw in ["corporate hq", "corporate", "hq"]:
        return ["Corporate HQ"]
    return ["Agronomy"]

features = []
for _, row in df.iterrows():
    try:
        lat = float(row["Latitude"])
        lon = float(row["Longitude"])
    except:
        continue

    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "Long Name": row["Long Name"],
            "Retailer": row["Retailer"],
            "Name": row["Name"],
            "Address": row["Address"],
            "City": row["City"],
            "State": row["State"],
            "Zip": row["Zip"],
            "Suppliers": row["Suppliers"],
            "ParsedCategories": normalize(row["Category"])
        }
    })

geo = {"type": "FeatureCollection", "features": features}
OUTFILE.write_text(json.dumps(geo, indent=2))
print(f"✅ Wrote retailers.geojson → {OUTFILE}")
