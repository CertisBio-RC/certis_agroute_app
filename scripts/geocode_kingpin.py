#!/usr/bin/env python3
"""
CERTIS — KINGPIN GEOCODING
- Input:  ../data/kingpin_COMBINED.xlsx
- Output: ../data/kingpin_latlong.xlsx
- Also writes: ./out/kingpin_geocoded.csv
- Cache:  ../data/geocode-cache.json

Token priority:
1) ENV: MAPBOX_TOKEN                 (explicit override for a run)
2) ENV: MAPBOX_ACCESS_TOKEN
3) ../data/token.txt                 (single-line token)
4) ../data/token.json                (supports:
      - {"MAPBOX_TOKEN_FOR_GEOCODING": "...", "MAPBOX_TOKEN_FOR_WEB": "..."}
      - {"token": "..."} / {"MAPBOX_TOKEN": "..."} / {"access_token": "..."} / {"MAPBOX_ACCESS_TOKEN": "..."} / {"MAPBOX_TOKEN_FOR_WEB": "..."}
   )

GEOCODE_STATUS values:
- ok
- http_401 / http_4xx / http_5xx
- no_token
- missing_query
- exception
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

MAPBOX_ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json"
MAPBOX_LIMIT = 1
MAPBOX_COUNTRY = "us"   # keep tight for speed/accuracy
MAPBOX_TYPES = "address,place,postcode"  # reasonable set for your queries


# -----------------------------
# Helpers
# -----------------------------
def banner(title: str) -> None:
    print("\n" + "=" * 43)
    print(f"  {title}")
    print("=" * 43 + "\n")


def safe_strip_token(raw: Any) -> str:
    """Strip whitespace and surrounding quotes if present."""
    if raw is None:
        return ""
    t = str(raw).strip()
    if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
        t = t[1:-1].strip()
    return t


def load_token() -> Tuple[str, str]:
    """
    Return (token, token_source). token_source is human-readable.

    Priority:
    1) ENV: MAPBOX_TOKEN
    2) ENV: MAPBOX_ACCESS_TOKEN
    3) data/token.txt
    4) data/token.json (prefers MAPBOX_TOKEN_FOR_GEOCODING)
    """
    # ENV first (single-run override)
    env1 = safe_strip_token(os.getenv("MAPBOX_TOKEN") or "")
    if env1:
        return env1, "env:MAPBOX_TOKEN"

    env2 = safe_strip_token(os.getenv("MAPBOX_ACCESS_TOKEN") or "")
    if env2:
        return env2, "env:MAPBOX_ACCESS_TOKEN"

    # token.txt (single line)
    token_txt = DATA_DIR / "token.txt"
    if token_txt.exists():
        try:
            lines = token_txt.read_text(encoding="utf-8", errors="ignore").splitlines()
            t = safe_strip_token(lines[0] if lines else "")
            if t:
                return t, "data/token.txt"
        except Exception:
            pass

    # token.json (supports your two-token format)
    token_json = DATA_DIR / "token.json"
    if token_json.exists():
        try:
            obj = json.loads(token_json.read_text(encoding="utf-8", errors="ignore"))

            # ✅ Your preferred keys (first choice for geocoding)
            for k in ("MAPBOX_TOKEN_FOR_GEOCODING",):
                if k in obj and obj[k]:
                    t = safe_strip_token(obj[k])
                    if t:
                        return t, f"data/token.json:{k}"

            # ✅ Acceptable fallbacks (in case you only have one token)
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
    fba = str(row.get("FULL BLOCK ADDRESS", "")).strip()
    if fba:
        # light cleanup; don't over-normalize (avoid accidentally mangling valid strings)
        fba = fba.replace(",,", ",").replace(" ,", ",").strip()
        fba = " ".join(fba.split())
        return fba

    addr = str(row.get("ADDRESS", "")).strip()
    city = str(row.get("CITY", "")).strip()
    st = str(row.get("STATE.1", "")).strip()
    z = str(row.get("ZIP CODE", "")).strip()
    parts = [p for p in [addr, city, st, z] if p]
    return ", ".join(parts).strip()


def mapbox_geocode(query: str, token: str) -> Tuple[str, Optional[float], Optional[float], str, int]:
    """
    Returns: (status, lat, lon, debug_msg, http_status)
    status: ok | http_401 | http_4xx | http_5xx | exception
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
                return "ok", None, None, "no_features", 200
            center = feats[0].get("center", None)
            if not center or len(center) != 2:
                return "ok", None, None, "no_center", 200
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

    df = pd.read_excel(INPUT_XLSX)
    rows_total = len(df)

    # Ensure output columns exist
    for col in ["GEOCODE_STATUS", "GEOCODE_QUERY", "LAT", "LON"]:
        if col not in df.columns:
            df[col] = ""

    skipped_existing = 0
    geocoded_new = 0
    failed_or_missing = 0
    cache_hits = 0
    cache_writes = 0

    # Fail-fast if token is wrong (401). We'll detect on first attempted request.
    saw_http_401 = False
    first_request_done = False

    for i in range(rows_total):
        row = df.iloc[i]

        # Existing lat/lon?
        lat_existing = str(row.get("LAT", "")).strip()
        lon_existing = str(row.get("LON", "")).strip()
        if lat_existing and lon_existing:
            skipped_existing += 1
            continue

        query = build_query(row)
        df.at[i, "GEOCODE_QUERY"] = query

        if not query:
            df.at[i, "GEOCODE_STATUS"] = "missing_query"
            failed_or_missing += 1
            continue

        if not token:
            df.at[i, "GEOCODE_STATUS"] = "no_token"
            failed_or_missing += 1
            continue

        if saw_http_401:
            # token is bad; don't continue burning requests
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

            # If 401, stop the bleeding — this is nearly always a token problem.
            if http_status == 401:
                saw_http_401 = True
                print("\n❌ Mapbox returned HTTP 401 on first failing request.")
                print("   This indicates the token used for geocoding is invalid/restricted.")
                print(f"   Token source used: {token_source}")
                print("   Fix: set MAPBOX_TOKEN to your geocoding token (Option A), OR ensure data/token.json has MAPBOX_TOKEN_FOR_GEOCODING.\n")
                # Do NOT cache 401 failures (they're not address-specific)
            else:
                # cache non-401 failures to reduce repeat hammering
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
        "skipped_existing_latlon": skipped_existing,
        "geocoded_new": geocoded_new,
        "failed_or_missing": failed_or_missing,
        "cache_file": str(CACHE_FILE),
        "cache_hits": cache_hits,
        "cache_writes": cache_writes,
        "out_csv": str(OUTPUT_CSV),
        "out_xlsx": str(OUTPUT_XLSX),
        "token_source": token_source,
    }
    print(json.dumps(summary, indent=2))

    # Clear hint if everything failed and we saw 401
    if first_request_done and geocoded_new == 0 and saw_http_401:
        print("\n⚠️  Run ended early due to HTTP 401 (token restriction).")
        print("   Confirm token.json contains MAPBOX_TOKEN_FOR_GEOCODING OR set env:MAPBOX_TOKEN before running.\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
