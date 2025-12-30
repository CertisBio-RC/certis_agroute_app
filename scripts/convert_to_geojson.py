#!/usr/bin/env python3
import json
import os
import sys
from typing import Any, Dict, Optional, Tuple

import pandas as pd

# =============================================================================
# CERTIS AGROUTE DATABASE
# Convert data/retailers_latlong.xlsx -> public/data/retailers.geojson
#
# Header-safe:
# - Accepts LongName OR "Long Name"
# - Coordinates accepted from:
#     Latitude/Longitude  (preferred)
#     LAT/LON            (fallback)
#
# Drops:
# - rows missing valid coords
# =============================================================================

INPUT_FILE = os.path.join("data", "retailers_latlong.xlsx")
OUTPUT_FILE = os.path.join("public", "data", "retailers.geojson")

REQUIRED_MIN = ["Retailer", "Name", "City", "State", "Zip"]  # coords handled separately


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {}
    for c in df.columns:
        c_str = str(c).strip()
        low = c_str.lower()
        if low == "long name":
            rename_map[c] = "LongName"
        elif low == "longname":
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
        return s
    return v


def _to_float(v: Any) -> Optional[float]:
    """
    Robust float parse:
    - treats "", "nan", "none", "null" as missing
    - handles numeric-ish strings
    """
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
        low = s.lower()
        if low in {"nan", "none", "null"}:
            return None
        try:
            return float(s)
        except Exception:
            return None

    try:
        return float(v)
    except Exception:
        return None


def _get_coords(row: pd.Series) -> Optional[Tuple[float, float]]:
    """
    Returns (lat, lon) using preferred columns then fallback columns.
    """
    lat = _to_float(row.get("Latitude"))
    lon = _to_float(row.get("Longitude"))

    if lat is not None and lon is not None:
        return (lat, lon)

    # fallback
    lat2 = _to_float(row.get("LAT"))
    lon2 = _to_float(row.get("LON"))

    if lat2 is not None and lon2 is not None:
        return (lat2, lon2)

    return None


def make_feature(row: pd.Series, lat: float, lon: float) -> Dict[str, Any]:
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
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def main() -> None:
    if not os.path.exists(INPUT_FILE):
        raise FileNotFoundError(f"Missing file: {INPUT_FILE}")

    df = pd.read_excel(INPUT_FILE)
    df = normalize_columns(df)

    # ensure optional columns exist
    for c in ["LongName", "Address", "Category", "Suppliers", "Latitude", "Longitude", "LAT", "LON"]:
        if c not in df.columns:
            df[c] = pd.NA

    require_columns(df, REQUIRED_MIN)

    features = []
    dropped_no_coords = 0

    for _, row in df.iterrows():
        coords = _get_coords(row)
        if coords is None:
            dropped_no_coords += 1
            continue

        lat, lon = coords
        features.append(make_feature(row, lat, lon))

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
