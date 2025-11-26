import pandas as pd
import json
import re
import unicodedata

# ================================================================
# 🔧 SAME SANITIZER AS GEOCODER (Bailey Rule)
# ================================================================
def sanitize_address(raw_address: str, city: str, state: str, zip_code: str) -> str:
    raw_address = unicodedata.normalize("NFKD", str(raw_address or ""))
    raw_address = re.sub(r"\.0\b", "", raw_address)
    raw_address = re.sub(r"\b\.$", "", raw_address)
    raw_address = re.sub(r",\s*,", ", ", raw_address)
    raw_address = re.sub(r"\s+", " ", raw_address).strip()
    raw_address = raw_address.replace(" Ctr", " Center")
    raw_address = raw_address.replace(" Hwy", " Highway")

    if not zip_code or not re.search(r"\d{5}", str(zip_code)):
        zip_code = ""

    if raw_address and city and state and zip_code:
        return f"{raw_address}, {city}, {state} {zip_code}"
    if raw_address and city and state:
        return f"{raw_address}, {city}, {state}"
    if city and state:
        return f"{city} City Center, {state}"
    return raw_address.strip()


# ================================================================
# 📘 CONVERSION PIPELINE
# ================================================================
def main():
    # Read the lat/long file from /data
    df = pd.read_excel("data/kingpin_latlong.xlsx")

    features = []

    for _, row in df.iterrows():
        name = row.get("Name", "")
        city = row.get("City", "")
        state = row.get("State", "")
        raw_address = row.get("Address", "")
        zip_code = row.get("Zip", "")
        lon = row.get("Longitude", "")
        lat = row.get("Latitude", "")

        clean_addr = sanitize_address(raw_address, city, state, zip_code)

        # Skip rows with missing coordinates
        if not lon or not lat:
            continue

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(lon), float(lat)],
            },
            "properties": {
                "Name": str(name),
                "Address": str(clean_addr),
                "City": str(city),
                "State": str(state),
                "Zip": str(zip_code),
                "Category": "Kingpin"
            }
        }

        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    # Output file goes to /public/data
    with open("public/data/kingpin.geojson", "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)

    print("public/data/kingpin.geojson successfully generated.")


if __name__ == "__main__":
    main()
