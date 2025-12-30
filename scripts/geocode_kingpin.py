#!/usr/bin/env python3
# scripts/geocode_kingpin.py
# ============================================================
# 👑 CERTIS AgRoute Database — KINGPIN GEOCODING (ROBUST)
# - Repo-root safe paths (run from anywhere)
# - Prefers your real input: data/kingpin_COMBINED.xlsx
# - Reads ALL sheets (skips sheets starting with "_")
# - Handles column-name drift (ADDRESS vs Address vs Street, etc.)
# - Forces ZIP as string-ish (prevents 56138.0)
# - Uses Mapbox token from env OR data/token.txt / data/token.json (BOM-safe)
# - Caches geocodes in data/geocode-cache.json
# - Outputs:
#     • data/kingpin_latlong.xlsx   (primary pipeline output)
#     • scripts/out/kingpin_geocoded.csv (audit)
# ============================================================

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Dict, Optional, Tuple, List

import pandas as pd
import requests


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
SCRIPTS_DIR = REPO_ROOT / "scripts"
OUT_DIR = SCRIPTS_DIR / "out"
CACHE_PATH = DATA_DIR / "geocode-cache.json"

OUT_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

MAPBOX_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/"


def _norm_col(name: str) -> str:
    # Uppercase, trim, collapse internal whitespace/newlines
    return " ".join(str(name).replace("\n", " ").replace("\r", " ").split()).strip().upper()


def _strip_quotes(s: str) -> str:
    s = str(s or "").strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1].strip()
    return s


def _load_token() -> str:
    # Prefer env (supports your workflow)
    for k in ("MAPBOX_ACCESS_TOKEN", "MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_TOKEN"):
        v = os.getenv(k, "").strip()
        if v:
            return _strip_quotes(v)

    # token files (BOM-safe)
    token_txt = DATA_DIR / "token.txt"
    if token_txt.exists():
        raw = _strip_quotes(token_txt.read_text(encoding="utf-8-sig").strip())
        # allow token=... format
        raw = re.sub(r"^\s*(token|access_token|mapbox_token|mapbox_access_token|next_public_mapbox_token)\s*=\s*",
                     "", raw, flags=re.IGNORECASE).strip()
        if raw.startswith("{") and raw.endswith("}"):
            try:
                obj = json.loads(raw)
                for kk in ("MAPBOX_ACCESS_TOKEN", "MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_TOKEN", "token", "access_token"):
                    if kk in obj and obj[kk]:
                        return _strip_quotes(str(obj[kk]))
            except Exception:
                pass
        return raw

    token_json = DATA_DIR / "token.json"
    if token_json.exists():
        try:
            obj = json.loads(token_json.read_text(encoding="utf-8-sig"))
            if isinstance(obj, dict):
                for kk in ("MAPBOX_ACCESS_TOKEN", "MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_TOKEN", "token", "access_token"):
                    if kk in obj and obj[kk]:
                        return _strip_quotes(str(obj[kk]))
        except Exception:
            pass

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
    # ✅ Your actual canonical input first
    candidates = [
        DATA_DIR / "kingpin_COMBINED.xlsx",
        DATA_DIR / "kingpin_COMBINED.xlsm",
        DATA_DIR / "kingpin_COMBINED.csv",
        # Backward/legacy possibilities
        DATA_DIR / "kingpin1_COMBINED.xlsx",
        DATA_DIR / "kingpin1_COMBINED.xlsm",
        DATA_DIR / "kingpin.xlsx",
        DATA_DIR / "kingpins.xlsx",
        DATA_DIR / "kingpins.csv",
        SCRIPTS_DIR / "in" / "kingpin.xlsx",
        SCRIPTS_DIR / "in" / "kingpins.xlsx",
    ]

    for p in candidates:
        if p.exists():
            return p

    hits = list(REPO_ROOT.rglob("*kingpin*.xlsx")) + list(REPO_ROOT.rglob("*kingpin*.xlsm")) + list(REPO_ROOT.rglob("*kingpin*.csv"))
    if hits:
        # most recently modified
        hits.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return hits[0]

    raise FileNotFoundError("Could not locate a Kingpin input file (xlsx/xlsm/csv).")


def _read_input_all_sheets(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, dtype=str, keep_default_na=False)

    xls = pd.ExcelFile(path)
    frames: List[pd.DataFrame] = []
    for sh in xls.sheet_names:
        if str(sh).strip().startswith("_"):
            continue
        df = pd.read_excel(path, sheet_name=sh, dtype=str, keep_default_na=False)
        df["_Sheet"] = str(sh)
        frames.append(df)

    if not frames:
        # fallback: first sheet
        sh = xls.sheet_names[0]
        df = pd.read_excel(path, sheet_name=sh, dtype=str, keep_default_na=False)
        df["_Sheet"] = str(sh)
        return df

    return pd.concat(frames, ignore_index=True)


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


def _geocode_mapbox(query: str, token: str, timeout_s: int = 25) -> Tuple[Optional[float], Optional[float], str]:
    url = MAPBOX_URL + requests.utils.quote(query) + ".json"
    params = {
        "access_token": token,
        "limit": 1,
        "autocomplete": "false",
    }
    r = requests.get(url, params=params, timeout=timeout_s)
    if r.status_code != 200:
        return None, None, f"http_{r.status_code}"

    data = r.json()
    feats = data.get("features", [])
    if not feats:
        return None, None, "no_results"

    center = feats[0].get("center")
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
        raise RuntimeError(
            "Missing Mapbox token. Set MAPBOX_ACCESS_TOKEN (or MAPBOX_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN) "
            "or put it in data/token.txt or data/token.json"
        )

    input_path = _detect_input_file()
    print(f"Input: {input_path}")

    df = _read_input_all_sheets(input_path)
    df.columns = [str(c) for c in df.columns]  # ensure string cols

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
    state_col = _pick_col(cols_norm_to_actual, ("STATE", "ST", "STATE ABBR", "STATE CODE", "STATE.1"))
    zip_col = _pick_col(cols_norm_to_actual, ("ZIP", "ZIP CODE", "ZIPCODE", "POSTAL", "POSTAL CODE"))

    # Lat/Lon columns (if already present)
    # We standardize final outputs to LAT/LON columns, but we can detect existing variants.
    lat_existing = _pick_col(cols_norm_to_actual, ("LAT", "LATITUDE", "Y"))
    lon_existing = _pick_col(cols_norm_to_actual, ("LON", "LONG", "LONGITUDE", "X", "LNG"))

    if not address_col or not city_col or not state_col or not zip_col:
        print("\n❌ Column detection failed. Found columns (normalized):")
        for k in sorted(cols_norm_to_actual.keys()):
            print(" -", k)
        raise KeyError("Could not find required address columns. Need at least: ADDRESS + CITY + STATE + ZIP.")

    cache = _load_cache()
    cache_hits = 0
    cache_writes = 0
    geocoded_new = 0
    skipped_existing = 0
    failed = 0

    # Ensure output columns exist
    if "GEOCODE_STATUS" not in df.columns:
        df["GEOCODE_STATUS"] = ""
    if "GEOCODE_QUERY" not in df.columns:
        df["GEOCODE_QUERY"] = ""
    if "LAT" not in df.columns:
        df["LAT"] = ""
    if "LON" not in df.columns:
        df["LON"] = ""

    for i, row in df.iterrows():
        # If already has LAT/LON (or existing columns), skip
        existing_lat, existing_lon = _get_latlon_from_row(row, "LAT", "LON")
        if existing_lat is None or existing_lon is None:
            # try existing lat/lon columns if present (e.g., Latitude/Longitude)
            ex_lat2, ex_lon2 = _get_latlon_from_row(row, lat_existing, lon_existing)
            if ex_lat2 is not None and ex_lon2 is not None:
                df.at[i, "LAT"] = str(ex_lat2)
                df.at[i, "LON"] = str(ex_lon2)
                skipped_existing += 1
                continue
        else:
            skipped_existing += 1
            continue

        addr = str(row.get(address_col, "")).strip()
        city = str(row.get(city_col, "")).strip()
        state = str(row.get(state_col, "")).strip()
        z = str(row.get(zip_col, "")).strip()

        # Normalize ZIP: keep digits and dash
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
            continue

        lat, lon, status = _geocode_mapbox(query, token)
        df.at[i, "GEOCODE_STATUS"] = status
        if lat is not None and lon is not None:
            df.at[i, "LAT"] = str(lat)
            df.at[i, "LON"] = str(lon)
            geocoded_new += 1

            cache[cache_key] = {"lat": lat, "lon": lon, "status": status, "query": query}
            cache_writes += 1
        else:
            failed += 1

        # Gentle throttle (Mapbox rate safety)
        time.sleep(0.08)

    _save_cache(cache)

    # Outputs
    out_csv = OUT_DIR / "kingpin_geocoded.csv"
    df.to_csv(out_csv, index=False, encoding="utf-8")

    out_xlsx = DATA_DIR / "kingpin_latlong.xlsx"
    try:
        df.to_excel(out_xlsx, index=False)
    except Exception:
        # If Excel write fails for any reason, at least leave the CSV.
        pass

    print("\n===========================================")
    print("  KINGPIN GEOCODING COMPLETE")
    print("===========================================")
    print(
        json.dumps(
            {
                "input_file": str(input_path),
                "rows_total": int(len(df)),
                "skipped_existing_latlon": int(skipped_existing),
                "geocoded_new": int(geocoded_new),
                "failed_or_missing": int(failed),
                "cache_file": str(CACHE_PATH),
                "cache_hits": int(cache_hits),
                "cache_writes": int(cache_writes),
                "out_csv": str(out_csv),
                "out_xlsx": str(out_xlsx),
                "token_source": "env_or_data/token.(txt|json)",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
