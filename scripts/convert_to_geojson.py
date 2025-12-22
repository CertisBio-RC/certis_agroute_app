import json
import os
import sys
from typing import Any, Dict

import pandas as pd

# =============================================================================
# CERTIS AGROUTE DATABASE
# Convert retailers_latlong.xlsx -> public/data/retailers.geojson
#
# Header-safe:
# - Accepts LongName OR "Long Name" (but latlong output should be LongName)
#
# Drops:
# - rows missing valid coords
# =============================================================================

INPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join("public", "data", "retailers.geojson")

REQUIRED = ["Retailer", "Name", "City", "State", "Zip", "Latitude", "Longitude"]


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {}
    for c in df.columns:
        c_str = str(c).strip()
        if c_str.lower() == "long name":
            rename_map[c] = "LongName"
        elif c_str.lower() == "longname":
            rename_map[c] = "LongName"
        else:
            rename_map[c] = c_str

    df = df.rename(columns=rename_map)

    if df.columns.duplicated().any():
        out = {}
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
        raise ValueError(f"❌ ERROR — Missing required columns in Excel: {', '.join(missing)}")


def safe_val(v: Any) -> Any:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return None
        # preserve raw strings; do not coerce "NaN" text to None here unless you want
        return s
    return v


def make_feature(row: pd.Series) -> Dict[str, Any]:
    lat = float(row["Latitude"])
    lng = float(row["Longitude"])

    props = {
        "LongName": safe_val(row.get("LongName")),
        "Retailer": safe_val(row.get("Retailer")),
        "Name": safe_val(row.get("Name")),
        "Address": safe_val(row.get("Address")),
        "City": safe_val(row.get("City")),
        "State": safe_val(row.get("State")),
        "Zip": safe_val(row.get("Zip")),
        "Category": safe_val(row.get("Category")),
        "Suppliers": safe_val(row.get("Suppliers")),
    }

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": props,
    }


def main() -> None:
    if not os.path.exists(INPUT_FILE):
        raise FileNotFoundError(f"Missing file: {INPUT_FILE}")

    df = pd.read_excel(INPUT_FILE)
    df = normalize_columns(df)

    # ensure optional columns exist
    for c in ["LongName", "Address", "Category", "Suppliers"]:
        if c not in df.columns:
            df[c] = pd.NA

    require_columns(df, REQUIRED)

    features = []
    dropped_no_coords = 0

    for _, row in df.iterrows():
        lat = row.get("Latitude")
        lng = row.get("Longitude")

        # validate coords
        try:
            if pd.isna(lat) or pd.isna(lng):
                dropped_no_coords += 1
                continue
            float(lat)
            float(lng)
        except Exception:
            dropped_no_coords += 1
            continue

        features.append(make_feature(row))

    geo = {"type": "FeatureCollection", "features": features}

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False)

    print(f"📍 Saved GeoJSON → {OUTPUT_FILE}")
    print(f"✅ Convert complete (features={len(features)}, dropped_no_coords={dropped_no_coords})")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
