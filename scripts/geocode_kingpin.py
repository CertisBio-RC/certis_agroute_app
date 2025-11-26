import pandas as pd
import requests
import re
import unicodedata
import time
import os

MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")

# ================================================================
# 🔧 ADDRESS SANITIZATION ENGINE — Bailey Rule Compliant
# ================================================================
def sanitize_address(raw_address: str, city: str, state: str, zip_code: str) -> str:
    if not raw_address:
        raw_address = ""

    # Remove weird unicode artifacts
    raw_address = unicodedata.normalize("NFKD", raw_address)

    # Strip Excel float artifacts → "123.0" → "123"
    raw_address = re.sub(r"\.0\b", "", raw_address)

    # Remove trailing periods
    raw_address = re.sub(r"\b\.$", "", raw_address)

    # Replace double commas
    raw_address = re.sub(r",\s*,", ", ", raw_address)

    # Collapse multiple spaces
    raw_address = re.sub(r"\s+", " ", raw_address).strip()

    # Expand problematic abbreviations
    raw_address = raw_address.replace(" Ctr", " Center")
    raw_address = raw_address.replace(" Hwy", " Highway")

    # Fix missing ZIP → use City Center
    if not zip_code or not re.search(r"\d{5}", str(zip_code)):
        zip_code = ""

    # Build canonical Mapbox address
    if raw_address and city and state and zip_code:
        return f"{raw_address}, {city}, {state} {zip_code}"

    # If no ZIP but we have city + state
    if raw_address and city and state:
        return f"{raw_address}, {city}, {state}"

    # Fallback — City Center only
    if city and state:
        return f"{city} City Center, {state}"

    # Last fallback
    return raw_address.strip()


# ================================================================
# 🌎 GEOCODING FUNCTION
# ================================================================
def geocode_address(address: str):
    if not address:
        return None, None

    url = "https://api.mapbox.com/search/geocode/v6/forward"
    params = {"q": address, "access_token": MAPBOX_TOKEN}

    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        if "features" in data and len(data["features"]) > 0:
            coords = data["features"][0]["geometry"]["coordinates"]
            return coords[0], coords[1]
        return None, None

    except Exception:
        return None, None


# ================================================================
# 📘 MAIN PIPELINE
# ================================================================
def main():
    # Correct path into /data folder
    df = pd.read_excel("data/kingpin1_COMBINED.xlsx")

    results = []
    for _, row in df.iterrows():
        name = str(row.get("Name", "")).strip()
        city = str(row.get("City", "")).strip()
        state = str(row.get("State", "")).strip()
        zip_code = str(row.get("Zip", "")).strip()
        raw_address = str(row.get("Address", "")).strip()

        clean_addr = sanitize_address(raw_address, city, state, zip_code)
        lon, lat = geocode_address(clean_addr)

        results.append({
            "Name": name,
            "Address": clean_addr,
            "City": city,
            "State": state,
            "Zip": zip_code,
            "Longitude": lon if lon is not None else "",
            "Latitude": lat if lat is not None else "",
        })

        time.sleep(0.15)  # Avoid Mapbox rate limit

    out_df = pd.DataFrame(results)
    out_df.to_excel("data/kingpin_latlong.xlsx", index=False)

    print("Geocoding complete — data/kingpin_latlong.xlsx generated.")


if __name__ == "__main__":
    main()
