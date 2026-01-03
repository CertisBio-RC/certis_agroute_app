#!/usr/bin/env python3
"""
CERTIS — KINGPIN GEOCODING
- Input:  ../data/kingpin_COMBINED.xlsx
- Output: ../data/kingpin_latlong.xlsx
- Also writes: ./out/kingpin_geocoded.csv
- Cache:  ../data/geocode-cache.json

NEW (Bailey rule per John):
- If Kingpin has NO address, use phone area code to assign a City Center.
  • Area code is extracted from OFFICE PHONE first, then CELL PHONE.
  • We look up the area code in: ../data/area_code_city_centers.csv
  • Then geocode: "City Center, <City>, <State> <Zip>"
- If Kingpin has NO address and NO phone → ignore (drop).

Required CSV format (in /data):
area_code,city,state,zip
(e.g. 402,Louisville,KY,40202)

GEOCODE_STATUS values include:
- ok
- no_features / no_center
- http_401 / http_4xx / http_5xx
- no_token
- missing_query
- exception
- dropped_no_address_no_phone
- missing_area_code_lookup
"""

import json
import os
import time
import hashlib
from pathlib import Path
from typing import Any, Dict, Tuple, Optional

import pandas as pd
import requests


# -----------------------------
# Paths (Bailey rule: Excel in /data)
# -----------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_DIR = ROOT_DIR / "data"
OUT_DIR = SCRIPT_DIR / "out"

INPUT_XLSX = DATA_DIR / "kingpin_COMBINED.xlsx"
OUTPUT_XLSX = DATA_DIR / "kingpin_latlong.xlsx"
OUTPUT_CSV = OUT_DIR / "kingpin_geocoded.csv"

CACHE_FILE = DATA_DIR / "geocode-cache.json"

# NEW: Area code → largest population center lookup
AREA_CODE_CSV = DATA_DIR / "area_code_city_centers.csv"

MAPBOX_ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json"
MAPBOX_LIMIT = 1
MAPBOX_COUNTRY = "us"
MAPBOX_TYPES = "address,place,postcode"


# -----------------------------
# Helpers
# -----------------------------
def banner(title: str) -> None:
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60 + "\n")


def safe_strip_token(raw: Any) -> str:
    if raw is None:
        return ""
    t = str(raw).strip()
    if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
        t = t[1:-1].strip()
    return t


def load_token() -> Tuple[str, str]:
    # ENV first (single-run override)
    env1 = safe_strip_token(os.getenv("MAPBOX_TOKEN") or "")
    if env1:
        return env1, "env:MAPBOX_TOKEN"

    env2 = safe_strip_token(os.getenv("MAPBOX_ACCESS_TOKEN") or "")
    if env2:
        return env2, "env:MAPBOX_ACCESS_TOKEN"

    token_txt = DATA_DIR / "token.txt"
    if token_txt.exists():
        try:
            lines = token_txt.read_text(encoding="utf-8", errors="ignore").splitlines()
            t = safe_strip_token(lines[0] if lines else "")
            if t:
                return t, "data/token.txt"
        except Exception:
            pass

    token_json = DATA_DIR / "token.json"
    if token_json.exists():
        try:
            obj = json.loads(token_json.read_text(encoding="utf-8", errors="ignore"))

            for k in ("MAPBOX_TOKEN_FOR_GEOCODING",):
                if k in obj and obj[k]:
                    t = safe_strip_token(obj[k])
                    if t:
                        return t, f"data/token.json:{k}"

            for k in (
                "MAPBOX_TOKEN",
                "MAPBOX_ACCESS_TOKEN",
                "access_token",
                "token",
                "MAPBOX_TOKEN_FOR_WEB",
            ):
                if k in obj and obj[k]:
                    t = safe_strip_token(obj[k])
                    if t:
                        return t, f"data/token.json:{k}"
        except Exception:
            pass

    return "", "none"


def load_cache(path: Path) -> Dict[str, Dict[str, Any]]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(path: Path, cache: Dict[str, Dict[str, Any]]) -> None:
    path.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def cache_key(query: str) -> str:
    return hashlib.sha256(query.strip().encode("utf-8")).hexdigest()


def is_blank(v: Any) -> bool:
    # Handles real NaN, None, "", "nan"
    if v is None:
        return True
    try:
        if pd.isna(v):
            return True
    except Exception:
        pass
    s = str(v).strip()
    if not s:
        return True
    if s.lower() in ("nan", "none", "null"):
        return True
    return False


def digits_only(s: Any) -> str:
    if s is None:
        return ""
    return "".join([c for c in str(s) if c.isdigit()])


def extract_area_code(row: pd.Series) -> str:
    """
    Priority: OFFICE PHONE, then CELL PHONE.
    Returns 3-digit area code or "".
    """
    for col in ("OFFICE PHONE", "CELL PHONE"):
        raw = row.get(col, "")
        d = digits_only(raw)
        if len(d) >= 10:
            return d[:3]
        if len(d) >= 7:
            # Sometimes numbers come in without country/area formatting;
            # but 7 digits isn't enough for an area code.
            continue
        if len(d) == 3:
            return d
    return ""


def load_area_code_lookup(path: Path) -> Dict[str, Dict[str, str]]:
    """
    Reads ../data/area_code_city_centers.csv
    Required columns: area_code,city,state,zip
    Returns dict keyed by area_code string.
    """
    lookup: Dict[str, Dict[str, str]] = {}
    if not path.exists():
        return lookup

    try:
        df = pd.read_csv(path, dtype=str).fillna("")
        cols = {c.strip().lower(): c for c in df.columns}
        need = ["area_code", "city", "state", "zip"]
        if not all(k in cols for k in need):
            return lookup

        for _, r in df.iterrows():
            ac = str(r[cols["area_code"]]).strip()
            city = str(r[cols["city"]]).strip()
            st = str(r[cols["state"]]).strip()
            z = str(r[cols["zip"]]).strip()
            if not ac or not city or not st:
                continue
            lookup[ac] = {"city": city, "state": st, "zip": z}
    except Exception:
        return {}

    return lookup


def has_any_address_fields(row: pd.Series) -> bool:
    fba = row.get("FULL BLOCK ADDRESS", "")
    addr = row.get("ADDRESS", "")
    city = row.get("CITY", "")
    st = row.get("STATE.1", "")
    z = row.get("ZIP CODE", "")
    return not (is_blank(fba) and is_blank(addr) and is_blank(city) and is_blank(st) and is_blank(z))


def build_query(row: pd.Series) -> str:
    """
    Prefer FULL BLOCK ADDRESS if present.
    Expected columns:
    - FULL BLOCK ADDRESS
    - ADDRESS
    - CITY
    - STATE.1
    - ZIP CODE
    """
    fba = row.get("FULL BLOCK ADDRESS", "")
    if not is_blank(fba):
        s = str(fba).strip()
        s = s.replace(",,", ",").replace(" ,", ",").strip()
        s = " ".join(s.split())
        return s

    addr = str(row.get("ADDRESS", "")).strip()
    city = str(row.get("CITY", "")).strip()
    st = str(row.get("STATE.1", "")).strip()
    z = str(row.get("ZIP CODE", "")).strip()
    parts = [p for p in [addr, city, st, z] if p]
    return ", ".join(parts).strip()


def build_city_center_query(city: str, state: str, zip_code: str) -> str:
    # You asked for: "City Center, City, State, Zip Code"
    parts = ["City Center", city.strip(), state.strip()]
    tail = " ".join([p for p in [state.strip(), zip_code.strip()] if p]).strip()
    if tail:
        return f"City Center, {city.strip()}, {tail}"
    return f"City Center, {city.strip()}, {state.strip()}".strip().rstrip(",")


def mapbox_geocode(query: str, token: str) -> Tuple[str, Optional[float], Optional[float], str, int]:
    """
    Returns: (status, lat, lon, debug_msg, http_status)
    """
    try:
        q_enc = requests.utils.quote(query, safe="")
        url = MAPBOX_ENDPOINT.format(q=q_enc)
        params = {
            "access_token": token,
            "limit": MAPBOX_LIMIT,
            "country": MAPBOX_COUNTRY,
            "types": MAPBOX_TYPES,
        }
        r = requests.get(url, params=params, timeout=20)

        if r.status_code == 200:
            data = r.json()
            feats = data.get("features", []) or []
            if not feats:
                return "no_features", None, None, "no_features", 200
            center = feats[0].get("center", None)
            if not center or len(center) != 2:
                return "no_center", None, None, "no_center", 200
            lon = float(center[0])
            lat = float(center[1])
            return "ok", lat, lon, "hit", 200

        if r.status_code == 401:
            return "http_401", None, None, (r.text[:200] if r.text else "401"), 401
        if 400 <= r.status_code < 500:
            return f"http_{r.status_code}", None, None, (r.text[:200] if r.text else str(r.status_code)), r.status_code
        if 500 <= r.status_code < 600:
            return f"http_{r.status_code}", None, None, (r.text[:200] if r.text else str(r.status_code)), r.status_code

        return f"http_{r.status_code}", None, None, (r.text[:200] if r.text else str(r.status_code)), r.status_code
    except Exception as e:
        return "exception", None, None, repr(e), 0


def is_valid_coord(lat: Any, lon: Any) -> bool:
    try:
        if pd.isna(lat) or pd.isna(lon):
            return False
    except Exception:
        pass
    try:
        latf = float(lat)
        lonf = float(lon)
    except Exception:
        return False
    if not (-90.0 <= latf <= 90.0 and -180.0 <= lonf <= 180.0):
        return False
    return True


def main() -> int:
    banner("CERTIS — KINGPIN GEOCODING STARTING")
    print(f"Input: {INPUT_XLSX}")

    if not INPUT_XLSX.exists():
        print(f"\n❌ Input file not found: {INPUT_XLSX}\n")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    token, token_source = load_token()
    if not token:
        print("\n❌ No Mapbox token found.")
        print("   Set MAPBOX_TOKEN env var, or place token in ../data/token.txt or ../data/token.json\n")
    else:
        print(f"\n🔑 Token source: {token_source}")
        print(f"🔑 Token length: {len(token)} (prefix: {token[:3]})")

    cache = load_cache(CACHE_FILE)

    area_lookup = load_area_code_lookup(AREA_CODE_CSV)
    if area_lookup:
        print(f"\n📍 Area code lookup loaded: {AREA_CODE_CSV} ({len(area_lookup)} entries)")
    else:
        print(f"\n⚠️  Area code lookup NOT found or empty: {AREA_CODE_CSV}")
        print("    Remote Kingpins without address will be marked 'missing_area_code_lookup' unless they have an address.\n")

    df = pd.read_excel(INPUT_XLSX)
    rows_total = len(df)

    # Ensure output columns exist (keep backwards compatibility)
    for col in ["GEOCODE_STATUS", "GEOCODE_QUERY", "LAT", "LON"]:
        if col not in df.columns:
            df[col] = ""

    # NEW diagnostics columns (non-breaking)
    for col in ["AREA_CODE", "GEO_ASSIGNMENT_METHOD"]:
        if col not in df.columns:
            df[col] = ""

    skipped_existing = 0
    geocoded_new = 0
    failed_or_missing = 0
    dropped_no_address_no_phone = 0
    area_code_assigned = 0
    cache_hits = 0
    cache_writes = 0

    saw_http_401 = False
    first_request_done = False

    for i in range(rows_total):
        row = df.iloc[i]

        # Existing lat/lon? (handle real NaN correctly)
        lat0 = row.get("LAT", "")
        lon0 = row.get("LON", "")
        if is_valid_coord(lat0, lon0):
            skipped_existing += 1
            continue

        # Apply your rule BEFORE we build a query
        method = "address"
        used_area_code = ""

        if not has_any_address_fields(row):
            ac = extract_area_code(row)
            used_area_code = ac
            df.at[i, "AREA_CODE"] = ac

            if not ac:
                # No address and no phone => ignore/drop
                df.at[i, "GEOCODE_STATUS"] = "dropped_no_address_no_phone"
                df.at[i, "GEOCODE_QUERY"] = ""
                df.at[i, "LAT"] = ""
                df.at[i, "LON"] = ""
                df.at[i, "GEO_ASSIGNMENT_METHOD"] = "dropped"
                dropped_no_address_no_phone += 1
                continue

            # Has phone area code but no address
            if not area_lookup or ac not in area_lookup:
                df.at[i, "GEOCODE_STATUS"] = "missing_area_code_lookup"
                df.at[i, "GEOCODE_QUERY"] = ""
                df.at[i, "LAT"] = ""
                df.at[i, "LON"] = ""
                df.at[i, "GEO_ASSIGNMENT_METHOD"] = "area_code_missing_lookup"
                failed_or_missing += 1
                continue

            city = area_lookup[ac]["city"]
            st = area_lookup[ac]["state"]
            z = area_lookup[ac].get("zip", "")

            # Fill the address fields for clarity downstream
            df.at[i, "ADDRESS"] = "City Center"
            df.at[i, "CITY"] = city
            df.at[i, "STATE.1"] = st
            df.at[i, "ZIP CODE"] = z
            df.at[i, "FULL BLOCK ADDRESS"] = build_city_center_query(city, st, z)

            method = "area_code_city_center"
            area_code_assigned += 1

        # Build query from (possibly updated) row
        query = build_query(df.iloc[i])
        df.at[i, "GEOCODE_QUERY"] = query
        df.at[i, "GEO_ASSIGNMENT_METHOD"] = method
        if used_area_code and method == "area_code_city_center":
            df.at[i, "AREA_CODE"] = used_area_code

        if not query:
            df.at[i, "GEOCODE_STATUS"] = "missing_query"
            failed_or_missing += 1
            continue

        if not token:
            df.at[i, "GEOCODE_STATUS"] = "no_token"
            failed_or_missing += 1
            continue

        if saw_http_401:
            df.at[i, "GEOCODE_STATUS"] = "http_401"
            failed_or_missing += 1
            continue

        ck = cache_key(query)
        if ck in cache:
            hit = cache[ck]
            df.at[i, "GEOCODE_STATUS"] = hit.get("status", "ok")
            df.at[i, "LAT"] = hit.get("lat", "")
            df.at[i, "LON"] = hit.get("lon", "")
            cache_hits += 1
            continue

        status, lat, lon, dbg, http_status = mapbox_geocode(query, token)
        first_request_done = True
        df.at[i, "GEOCODE_STATUS"] = status

        if status == "ok" and lat is not None and lon is not None:
            df.at[i, "LAT"] = lat
            df.at[i, "LON"] = lon
            geocoded_new += 1
            cache[ck] = {"status": status, "lat": lat, "lon": lon}
            cache_writes += 1
        else:
            failed_or_missing += 1

            if http_status == 401:
                saw_http_401 = True
                print("\n❌ Mapbox returned HTTP 401 on first failing request.")
                print("   Token used for geocoding is invalid/restricted.")
                print(f"   Token source used: {token_source}")
                print("   Fix: set MAPBOX_TOKEN env var OR ensure data/token.json has MAPBOX_TOKEN_FOR_GEOCODING.\n")
            else:
                cache[ck] = {"status": status, "lat": "", "lon": "", "debug": dbg}
                cache_writes += 1

        time.sleep(0.05)

    # Save artifacts
    try:
        save_cache(CACHE_FILE, cache)
    except Exception:
        pass

    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8")
    df.to_excel(OUTPUT_XLSX, index=False)

    banner("KINGPIN GEOCODING COMPLETE")
    summary = {
        "input_file": str(INPUT_XLSX),
        "rows_total": rows_total,
        "skipped_existing_valid_latlon": skipped_existing,
        "area_code_city_center_assigned": area_code_assigned,
        "dropped_no_address_no_phone": dropped_no_address_no_phone,
        "geocoded_new": geocoded_new,
        "failed_or_missing": failed_or_missing,
        "cache_file": str(CACHE_FILE),
        "cache_hits": cache_hits,
        "cache_writes": cache_writes,
        "area_code_lookup_file": str(AREA_CODE_CSV),
        "out_csv": str(OUTPUT_CSV),
        "out_xlsx": str(OUTPUT_XLSX),
        "token_source": token_source,
    }
    print(json.dumps(summary, indent=2))

    if first_request_done and geocoded_new == 0 and saw_http_401:
        print("\n⚠️  Run ended early due to HTTP 401 (token restriction).")
        print("   Confirm token.json contains MAPBOX_TOKEN_FOR_GEOCODING OR set env:MAPBOX_TOKEN before running.\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
