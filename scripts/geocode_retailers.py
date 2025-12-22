import os
import sys
import time
import urllib.parse
from typing import Any, Dict, Optional, Tuple

import pandas as pd
import requests

# =============================================================================
# CERTIS AGROUTE DATABASE
# Geocode retailers.xlsx -> retailers_latlong.xlsx
#
# Header-safe:
# - Accepts LongName OR "Long Name"
# - Outputs LongName (canonical) in the lat/long file
#
# Writes:
# - data/retailers_latlong.xlsx
# =============================================================================

INPUT_FILE = os.path.join("data", "retailers.xlsx")
OUTPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")

GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"

# Canonical columns we will produce
CANON_COLS = [
    "LongName",
    "Retailer",
    "Name",
    "Address",
    "City",
    "State",
    "Zip",
    "Category",
    "Suppliers",
    "Latitude",
    "Longitude",
]

REQUIRED_MIN = ["Retailer", "Name", "Address", "City", "State", "Zip"]

# Rate limiting (Mapbox is fast, but be polite)
SLEEP_SECONDS = 0.05


def get_token() -> str:
    tok = os.environ.get("MAPBOX_TOKEN") or os.environ.get("NEXT_PUBLIC_MAPBOX_TOKEN")
    if not tok:
        raise RuntimeError(
            "Missing MAPBOX token. Set MAPBOX_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN in your environment."
        )
    return tok


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize column names and map Long Name -> LongName if needed.
    Keeps all columns, just renames known variants.
    """
    rename_map: Dict[str, str] = {}
    for c in df.columns:
        c_str = str(c).strip()
        if c_str.lower() == "long name":
            rename_map[c] = "LongName"
        elif c_str.lower() == "longname":
            rename_map[c] = "LongName"
        else:
            # Keep exact trimmed header (helps with weird trailing spaces)
            rename_map[c] = c_str

    df = df.rename(columns=rename_map)

    # If both LongName and "Long Name" existed, ensure LongName wins
    # (after rename, duplicates may appear)
    if df.columns.duplicated().any():
        # collapse duplicates by taking first non-null per row
        out: Dict[str, pd.Series] = {}
        for col in df.columns:
            if col not in out:
                out[col] = df[col]
            else:
                out[col] = out[col].where(~out[col].isna(), df[col])
        df = pd.DataFrame(out)

    return df


def require_columns(df: pd.DataFrame, cols: list) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns in {INPUT_FILE}: {', '.join(missing)}")


def safe_str(v: Any) -> str:
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except Exception:
        pass
    return str(v).strip()


def build_query(row: pd.Series) -> str:
    addr = safe_str(row.get("Address"))
    city = safe_str(row.get("City"))
    state = safe_str(row.get("State"))
    z = safe_str(row.get("Zip"))

    parts = [p for p in [addr, city, state, z] if p]
    return ", ".join(parts)


def geocode_one(token: str, query: str) -> Optional[Tuple[float, float]]:
    if not query:
        return None

    url = GEOCODE_URL.format(query=urllib.parse.quote(query))
    try:
        r = requests.get(url, params={"access_token": token, "limit": 1}, timeout=20)
    except Exception:
        return None

    if r.status_code != 200:
        return None

    data = r.json()
    feats = data.get("features") or []
    if not feats:
        return None

    center = feats[0].get("center")
    if not center or len(center) != 2:
        return None

    lng, lat = center[0], center[1]
    return float(lat), float(lng)


def main() -> None:
    token = get_token()

    if not os.path.exists(INPUT_FILE):
        raise FileNotFoundError(f"Missing file: {INPUT_FILE}")

    df = pd.read_excel(INPUT_FILE)
    df = normalize_columns(df)

    require_columns(df, REQUIRED_MIN)

    # Ensure canonical optional fields exist
    for c in ["LongName", "Category", "Suppliers"]:
        if c not in df.columns:
            df[c] = pd.NA

    # Preserve existing coords if they exist
    if "Latitude" not in df.columns:
        df["Latitude"] = pd.NA
    if "Longitude" not in df.columns:
        df["Longitude"] = pd.NA

    updated = 0
    failures = 0

    for i, row in df.iterrows():
        # skip if already has coords
        lat = row.get("Latitude")
        lng = row.get("Longitude")
        if pd.notna(lat) and pd.notna(lng):
            continue

        query = build_query(row)
        retailer = safe_str(row.get("Retailer"))
        name = safe_str(row.get("Name"))

        if query:
            print(f"→ Geocoding {retailer} — {query}")
        else:
            failures += 1
            continue

        result = geocode_one(token, query)
        time.sleep(SLEEP_SECONDS)

        if result is None:
            failures += 1
            continue

        lat2, lng2 = result
        df.at[i, "Latitude"] = lat2
        df.at[i, "Longitude"] = lng2
        updated += 1

    # Reorder into canonical output (keep only these)
    for c in CANON_COLS:
        if c not in df.columns:
            df[c] = pd.NA
    df = df[CANON_COLS].copy()

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    df.to_excel(OUTPUT_FILE, index=False)

    print(f"\n📘 Saved Excel → {OUTPUT_FILE}")
    print(f"✅ Retailer Geocoding Complete (updated={updated}, failures={failures})")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
