# scripts/geocode_kingpin.py
# ============================================================
# 👑 CERTIS AgRoute Database — KINGPIN GEOCODING (ROBUST)
# - Handles column-name drift (ADDRESS vs Address vs Street, etc.)
# - Forces ZIP as string (prevents 56138.0)
# - Uses Mapbox token from env or data/token.txt
# - Caches geocodes in data/geocode-cache.json
# - Outputs scripts/out/kingpin_geocoded.csv
# ============================================================

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

import pandas as pd
import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
SCRIPTS_DIR = REPO_ROOT / "scripts"
OUT_DIR = SCRIPTS_DIR / "out"
CACHE_PATH = DATA_DIR / "geocode-cache.json"

OUT_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _norm_col(name: str) -> str:
    # Uppercase, trim, collapse internal whitespace/newlines
    return " ".join(str(name).replace("\n", " ").replace("\r", " ").split()).strip().upper()


def _load_token() -> str:
    env = os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN", "").strip()
    if env:
        return env

    token_file = DATA_DIR / "token.txt"
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()

    return ""


def _load_cache() -> Dict[str, dict]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_cache(cache: Dict[str, dict]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def _detect_input_file() -> Path:
    # Add/adjust candidates as needed, but do NOT break if one is missing
    candidates = [
        REPO_ROOT / "scripts" / "in" / "kingpin.xlsx",
        REPO_ROOT / "scripts" / "in" / "kingpins.xlsx",
        REPO_ROOT / "data" / "kingpin.xlsx",
        REPO_ROOT / "data" / "kingpins.xlsx",
        REPO_ROOT / "data" / "kingpin1_COMBINED.xlsx",
        REPO_ROOT / "data" / "kingpin1_COMBINED.xlsm",
        REPO_ROOT / "data" / "kingpin1_COMBINED.csv",
        REPO_ROOT / "data" / "kingpins.csv",
    ]

    for p in candidates:
        if p.exists():
            return p

    # Fallback: try to find anything that looks like kingpin
    hits = list(REPO_ROOT.rglob("*kingpin*.xlsx")) + list(REPO_ROOT.rglob("*kingpin*.csv"))
    if hits:
        return hits[0]

    raise FileNotFoundError("Could not locate a Kingpin input file (xlsx/csv).")


def _read_input(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path, dtype=str, keep_default_na=False)
        return df

    # Excel
    xls = pd.ExcelFile(path)
    sheet = xls.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sheet, dtype=str, keep_default_na=False)
    return df


def _pick_col(cols_norm_to_actual: Dict[str, str], options: Tuple[str, ...]) -> Optional[str]:
    for opt in options:
        opt_norm = _norm_col(opt)
        if opt_norm in cols_norm_to_actual:
            return cols_norm_to_actual[opt_norm]
    return None


def _get_latlon_from_row(row: pd.Series, lat_col: Optional[str], lon_col: Optional[str]) -> Tuple[Optional[float], Optional[float]]:
    if not lat_col or not lon_col:
        return None, None

    lat_raw = str(row.get(lat_col, "")).strip()
    lon_raw = str(row.get(lon_col, "")).strip()
    if not lat_raw or not lon_raw:
        return None, None

    try:
        return float(lat_raw), float(lon_raw)
    except Exception:
        return None, None


def _geocode_mapbox(address: str, token: str, timeout_s: int = 20) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    # Returns (lat, lon, status)
    url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + requests.utils.quote(address) + ".json"
    params = {
        "access_token": token,
        "limit": 1,
        "autocomplete": "false",
        # Bias is optional; keep simple unless you want midwest bias later
    }
    r = requests.get(url, params=params, timeout=timeout_s)
    if r.status_code != 200:
        return None, None, f"http_{r.status_code}"

    data = r.json()
    feats = data.get("features", [])
    if not feats:
        return None, None, "no_results"

    center = feats[0].get("center", None)
    if not center or len(center) != 2:
        return None, None, "bad_center"

    lon, lat = center[0], center[1]
    return float(lat), float(lon), "ok"


def main() -> None:
    print("\n===========================================")
    print("  CERTIS — KINGPIN GEOCODING STARTING")
    print("===========================================\n")

    token = _load_token()
    if not token:
        raise RuntimeError("Missing Mapbox token. Set NEXT_PUBLIC_MAPBOX_TOKEN or put it in data/token.txt")

    input_path = _detect_input_file()
    print(f"Input: {input_path}")

    df = _read_input(input_path)

    # Normalize column map
    cols_norm_to_actual = {_norm_col(c): c for c in df.columns}

    # Address components (allow drift)
    address_col = _pick_col(
        cols_norm_to_actual,
        (
            "ADDRESS", "ADDRESS 1", "STREET", "STREET ADDRESS", "MAILING ADDRESS",
            "LOCATION ADDRESS", "ADDR", "ADDR1"
        ),
    )
    city_col = _pick_col(cols_norm_to_actual, ("CITY", "TOWN"))
    state_col = _pick_col(cols_norm_to_actual, ("STATE", "ST", "STATE ABBR", "STATE CODE"))
    zip_col = _pick_col(cols_norm_to_actual, ("ZIP", "ZIP CODE", "ZIPCODE", "POSTAL", "POSTAL CODE"))

    # Lat/Lon columns (if already present)
    lat_col = _pick_col(cols_norm_to_actual, ("LAT", "LATITUDE", "Y"))
    lon_col = _pick_col(cols_norm_to_actual, ("LON", "LONG", "LONGITUDE", "X", "LNG"))

    if not address_col or not city_col or not state_col or not zip_col:
        print("\n❌ Column detection failed. Found columns (normalized):")
        for k in sorted(cols_norm_to_actual.keys()):
            print(" -", k)
        raise KeyError(
            "Could not find required address columns. Need at least: ADDRESS + CITY + STATE + ZIP."
        )

    cache = _load_cache()
    cache_hits = 0
    cache_writes = 0
    geocoded = 0
    skipped_existing = 0
    failed = 0

    # Prepare output cols if missing
    if "GEOCODE_STATUS" not in df.columns:
        df["GEOCODE_STATUS"] = ""
    if "GEOCODE_QUERY" not in df.columns:
        df["GEOCODE_QUERY"] = ""
    if "LAT" not in df.columns:
        df["LAT"] = ""
    if "LON" not in df.columns:
        df["LON"] = ""

    for i, row in df.iterrows():
        # If already has lat/lon, skip
        existing_lat, existing_lon = _get_latlon_from_row(row, "LAT", "LON")
        if existing_lat is not None and existing_lon is not None:
            skipped_existing += 1
            continue

        # Build address query
        addr = str(row.get(address_col, "")).strip()
        city = str(row.get(city_col, "")).strip()
        state = str(row.get(state_col, "")).strip()
        z = str(row.get(zip_col, "")).strip()

        # Normalize ZIP: keep only leading 5 or 9 digits if it looks numeric-ish
        # (does not destroy alphanumeric postal codes, but your data is US)
        z_compact = "".join(ch for ch in z if ch.isdigit() or ch == "-")
        if z_compact:
            z = z_compact

        if not addr or not city or not state:
            df.at[i, "GEOCODE_STATUS"] = "missing_min"
            failed += 1
            continue

        query = f"{addr}, {city}, {state} {z}".strip()
        df.at[i, "GEOCODE_QUERY"] = query

        cache_key = query.upper()
        if cache_key in cache and "lat" in cache[cache_key] and "lon" in cache[cache_key]:
            df.at[i, "LAT"] = str(cache[cache_key]["lat"])
            df.at[i, "LON"] = str(cache[cache_key]["lon"])
            df.at[i, "GEOCODE_STATUS"] = "cache"
            cache_hits += 1
            geocoded += 1
            continue

        lat, lon, status = _geocode_mapbox(query, token)
        df.at[i, "GEOCODE_STATUS"] = status or ""
        if lat is not None and lon is not None:
            df.at[i, "LAT"] = str(lat)
            df.at[i, "LON"] = str(lon)
            geocoded += 1

            cache[cache_key] = {"lat": lat, "lon": lon, "status": status, "query": query}
            cache_writes += 1
        else:
            failed += 1

        # Gentle throttle to avoid hammering API
        time.sleep(0.08)

    _save_cache(cache)

    out_csv = OUT_DIR / "kingpin_geocoded.csv"
    df.to_csv(out_csv, index=False, encoding="utf-8")

    print("\n===========================================")
    print("  KINGPIN GEOCODING COMPLETE")
    print("===========================================")
    print(
        json.dumps(
            {
                "input_file": str(input_path),
                "rows_total": int(len(df)),
                "skipped_existing_latlon": int(skipped_existing),
                "geocoded_new": int(geocoded),
                "failed_or_missing": int(failed),
                "cache_file": str(CACHE_PATH),
                "cache_hits": int(cache_hits),
                "cache_writes": int(cache_writes),
                "out_csv": str(out_csv),
                "token_source": "env_or_data/token.txt",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

