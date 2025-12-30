#!/usr/bin/env python3
"""
CERTIS AGROUTE DATABASE
Geocode data/retailers.xlsx -> data/retailers_latlong.xlsx

Header-safe:
- Accepts LongName OR "Long Name"
- Outputs LongName (canonical) in the lat/long file

Robust:
- Token resolution: MAPBOX_ACCESS_TOKEN / MAPBOX_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN
  plus data/token.txt or data/token.json (BOM-safe; txt may be JSON)
- Caches geocodes in data/geocode-cache.json
- Writes BOTH Latitude/Longitude and LAT/LON for downstream converter safety

Writes:
- data/retailers_latlong.xlsx
- scripts/out/retailers_geocode_stats.json
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import pandas as pd
import requests

# =============================================================================
# Paths (repo-root safe)
# =============================================================================
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
SCRIPTS_DIR = REPO_ROOT / "scripts"
OUT_DIR = SCRIPTS_DIR / "out"
OUT_DIR.mkdir(parents=True, exist_ok=True)

INPUT_FILE = DATA_DIR / "retailers.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers_latlong.xlsx"
CACHE_PATH = DATA_DIR / "geocode-cache.json"

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
    "LAT",
    "LON",
    "GEOCODE_STATUS",
    "GEOCODE_QUERY",
]

REQUIRED_MIN = ["Retailer", "Name", "Address", "City", "State", "Zip"]

# Rate limiting (Mapbox is fast, but be polite)
SLEEP_SECONDS = 0.06

# Debug: print first N failing HTTP responses (401/429/etc.)
PRINT_FIRST_N_HTTP_FAILURES = 8


# =============================================================================
# Token + cache helpers
# =============================================================================
def _strip_quotes(s: str) -> str:
    s = str(s or "").strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1].strip()
    return s


def _extract_token_from_obj(obj: Any) -> str:
    if isinstance(obj, str):
        return _strip_quotes(obj)
    if isinstance(obj, dict):
        for k in ("MAPBOX_ACCESS_TOKEN", "MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_TOKEN", "token", "access_token"):
            if k in obj and obj[k]:
                return _strip_quotes(str(obj[k]))
    return ""


def _load_token() -> str:
    # env first (supports your workflow)
    for k in ("MAPBOX_ACCESS_TOKEN", "MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_TOKEN"):
        v = os.getenv(k, "").strip()
        if v:
            return _strip_quotes(v)

    # token.txt (BOM-safe; may be raw token, token=..., or JSON)
    token_txt = DATA_DIR / "token.txt"
    if token_txt.exists():
        raw = _strip_quotes(token_txt.read_text(encoding="utf-8-sig").strip())

        # If JSON in .txt
        if raw.startswith("{") and raw.endswith("}"):
            try:
                obj = json.loads(raw)
                t = _extract_token_from_obj(obj)
                if t:
                    return t
            except Exception:
                pass

        # allow token=... format
        raw = re.sub(
            r"^\s*(token|access_token|mapbox_token|mapbox_access_token|next_public_mapbox_token)\s*=\s*",
            "",
            raw,
            flags=re.IGNORECASE,
        ).strip()
        return raw

    # token.json (BOM-safe)
    token_json = DATA_DIR / "token.json"
    if token_json.exists():
        try:
            obj = json.loads(token_json.read_text(encoding="utf-8-sig"))
            t = _extract_token_from_obj(obj)
            if t:
                return t
        except Exception:
            pass

    return ""


def _load_cache() -> Dict[str, Dict[str, Any]]:
    if CACHE_PATH.exists():
        try:
            obj = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
    return {}


def _save_cache(cache: Dict[str, Dict[str, Any]]) -> None:
    try:
        CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    except Exception:
        pass


def _cache_key(query: str) -> str:
    return query.strip().upper()


# =============================================================================
# Data helpers
# =============================================================================
def safe_str(v: Any) -> str:
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except Exception:
        pass
    return str(v).strip()


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize column names and map Long Name -> LongName if needed.
    Keeps all columns, just renames known variants.
    """
    rename_map: Dict[str, str] = {}
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

    # If duplicates exist, collapse by first non-null
    if df.columns.duplicated().any():
        out: Dict[str, pd.Series] = {}
        for col in df.columns:
            if col not in out:
                out[col] = df[col]
            else:
                out[col] = out[col].where(~out[col].isna(), df[col])
        df = pd.DataFrame(out)

    return df


def require_columns(df: pd.DataFrame, cols: list[str]) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise RuntimeError(f"Missing required columns in {INPUT_FILE}: {', '.join(missing)}")


def build_query(row: pd.Series) -> str:
    addr = safe_str(row.get("Address"))
    city = safe_str(row.get("City"))
    state = safe_str(row.get("State"))
    z = safe_str(row.get("Zip"))

    # Normalize ZIP (remove .0, keep digits and dash)
    z = z.replace(".0", "").strip()
    z_compact = "".join(ch for ch in z if ch.isdigit() or ch == "-")
    if z_compact:
        z = z_compact

    parts = [p for p in (addr, city, state, z) if p]
    return ", ".join(parts)


# =============================================================================
# Mapbox geocode
# =============================================================================
def geocode_one(token: str, query: str) -> Tuple[Optional[float], Optional[float], str, int, str]:
    """
    Returns (lat, lon, status_text, http_status, http_snippet)
    status_text:
      - ok
      - no_results
      - bad_center
      - http_### (with http_status populated)
      - exception
    """
    if not query:
        return None, None, "empty_query", 0, ""

    url = GEOCODE_URL.format(query=urllib.parse.quote(query))
    try:
        r = requests.get(url, params={"access_token": token, "limit": 1}, timeout=25)
    except Exception:
        return None, None, "exception", 0, ""

    if r.status_code != 200:
        snippet = (r.text or "").strip().replace("\n", " ")[:180]
        return None, None, f"http_{r.status_code}", int(r.status_code), snippet

    data = r.json()
    feats = data.get("features") or []
    if not feats:
        return None, None, "no_results", 200, ""

    center = feats[0].get("center")
    if not center or len(center) != 2:
        return None, None, "bad_center", 200, ""

    lon, lat = center[0], center[1]
    try:
        return float(lat), float(lon), "ok", 200, ""
    except Exception:
        return None, None, "bad_center", 200, ""


# =============================================================================
# Main
# =============================================================================
def main() -> None:
    token = _load_token()
    if not token:
        raise RuntimeError(
            "Missing Mapbox token. Set MAPBOX_ACCESS_TOKEN (or MAPBOX_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN) "
            "or put it in data/token.txt or data/token.json"
        )

    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Missing file: {INPUT_FILE}")

    df = pd.read_excel(INPUT_FILE)
    df = normalize_columns(df)

    require_columns(df, REQUIRED_MIN)

    # Ensure optional fields exist
    for c in ("LongName", "Category", "Suppliers"):
        if c not in df.columns:
            df[c] = pd.NA

    # Ensure coord fields exist (both styles)
    for c in ("Latitude", "Longitude", "LAT", "LON"):
        if c not in df.columns:
            df[c] = pd.NA

    # Debug columns
    if "GEOCODE_STATUS" not in df.columns:
        df["GEOCODE_STATUS"] = ""
    if "GEOCODE_QUERY" not in df.columns:
        df["GEOCODE_QUERY"] = ""

    cache = _load_cache()
    cache_hits = 0
    cache_writes = 0
    updated = 0
    failures = 0
    skipped_existing = 0
    printed_http_failures = 0
    http_fail_counts: Dict[str, int] = {}

    for i, row in df.iterrows():
        # skip if already has coords (either style)
        lat = row.get("Latitude")
        lon = row.get("Longitude")
        lat2 = row.get("LAT")
        lon2 = row.get("LON")

        if (pd.notna(lat) and pd.notna(lon)) or (pd.notna(lat2) and pd.notna(lon2)):
            skipped_existing += 1
            continue

        query = build_query(row)
        df.at[i, "GEOCODE_QUERY"] = query

        retailer = safe_str(row.get("Retailer"))
        name = safe_str(row.get("Name"))

        if not query:
            df.at[i, "GEOCODE_STATUS"] = "missing_query"
            failures += 1
            continue

        # cache
        ck = _cache_key(query)
        if ck in cache and isinstance(cache[ck], dict) and "lat" in cache[ck] and "lon" in cache[ck]:
            try:
                latc = float(cache[ck]["lat"])
                lonc = float(cache[ck]["lon"])
                df.at[i, "Latitude"] = latc
                df.at[i, "Longitude"] = lonc
                df.at[i, "LAT"] = latc
                df.at[i, "LON"] = lonc
                df.at[i, "GEOCODE_STATUS"] = "cache"
                cache_hits += 1
                continue
            except Exception:
                pass

        print(f"→ Geocoding {retailer} — {query}")

        lat_g, lon_g, status, http_status, snippet = geocode_one(token, query)
        df.at[i, "GEOCODE_STATUS"] = status

        if status.startswith("http_"):
            http_fail_counts[status] = http_fail_counts.get(status, 0) + 1
            if printed_http_failures < PRINT_FIRST_N_HTTP_FAILURES:
                printed_http_failures += 1
                print(f"⚠️  HTTP failure {status} for: {name} / {retailer} :: {snippet}")

        time.sleep(SLEEP_SECONDS)

        if lat_g is None or lon_g is None:
            failures += 1
            continue

        df.at[i, "Latitude"] = lat_g
        df.at[i, "Longitude"] = lon_g
        df.at[i, "LAT"] = lat_g
        df.at[i, "LON"] = lon_g
        updated += 1

        cache[ck] = {"lat": lat_g, "lon": lon_g, "status": status, "query": query}
        cache_writes += 1

    _save_cache(cache)

    # Output: reorder to canonical (keep only these, but includes both coord styles)
    for c in CANON_COLS:
        if c not in df.columns:
            df[c] = pd.NA
    df_out = df[CANON_COLS].copy()

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_excel(OUTPUT_FILE, index=False)

    stats = {
        "input": str(INPUT_FILE),
        "output": str(OUTPUT_FILE),
        "rows_total": int(len(df)),
        "skipped_existing_coords": int(skipped_existing),
        "updated_new_coords": int(updated),
        "failures": int(failures),
        "cache_file": str(CACHE_PATH),
        "cache_hits": int(cache_hits),
        "cache_writes": int(cache_writes),
        "http_fail_counts": http_fail_counts,
        "token_source": "env_or_data/token.(txt|json)",
    }
    (OUT_DIR / "retailers_geocode_stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")

    print(f"\n📘 Saved Excel → {OUTPUT_FILE}")
    print(f"✅ Retailer Geocoding Complete (updated={updated}, failures={failures})")
    if http_fail_counts:
        print("HTTP failure summary:", json.dumps(http_fail_counts, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
