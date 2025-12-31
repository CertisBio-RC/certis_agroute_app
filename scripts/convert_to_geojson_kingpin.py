#!/usr/bin/env python3
"""
CERTIS AGROUTE — Build public/data/kingpin.geojson (Hybrid, Bailey-safe)

GOAL (fixed):
  ✅ Do NOT “lose Kingpins” just because some spreadsheet fields are blank.
  ✅ If a row has usable coordinates (from kingpin_latlong.xlsx), it becomes a feature.
  ✅ Tier matching (T1/T2/T3) is used to ENRICH/LABEL, not to INCLUDE/EXCLUDE.
  ✅ TBD rows can optionally geocode (only when coords are missing) via --geocode-no-match.

DATA FLOW (Bailey rules honored):
  - Excel inputs live in /data
  - Output GeoJSON is written to: public/data/kingpin.geojson
  - Audit outputs: scripts/out/kingpin_enriched.csv, kingpin_unmatched.csv, kingpin_build_stats.json

Inputs:
  - data/kingpin_COMBINED.xlsx        (contact/retailer data)
  - data/kingpin_latlong.xlsx         (preferred coordinate authority for kingpins)
  - public/data/retailers.geojson     (facility enrichment authority for Category/Suppliers/coords fallback)

Token resolution (robust):
  1) ENV: MAPBOX_TOKEN / MAPBOX_ACCESS_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN
  2) data/token.txt (raw token OR JSON)
  3) data/token.json (BOM-safe JSON)
     Supports keys:
       - MAPBOX_TOKEN_FOR_GEOCODING (preferred if present)
       - MAPBOX_ACCESS_TOKEN / MAPBOX_TOKEN / token / access_token / NEXT_PUBLIC_MAPBOX_TOKEN

Category rules:
  - Facility categories canonicalized; messy/null-ish strings treated as missing
  - Missing/invalid facility categories default to "Agronomy"
  - Unmatched kingpins default Category to "Agronomy"

CLI:
  python .\\convert_to_geojson_kingpin.py
  python .\\convert_to_geojson_kingpin.py --geocode-no-match
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

# deps: pip install pandas openpyxl requests
import pandas as pd
import requests

MAPBOX_GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"

# NOTE: We still define "min required", but we do NOT drop rows that have coordinates.
KINGPIN_REQUIRED_MIN = ["Retailer", "ContactName", "Address", "City", "State", "Zip"]

_WS_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]")
DASH_STATE_SUFFIX_RE = re.compile(r"\s*-\s*([A-Za-z]{2}(?:\s+[A-Za-z]{2})*)\s*$")

TOKEN_MAP = {
    "hwy": "highway",
    "highwy": "highway",
    "rd": "road",
    "st": "street",
    "ave": "avenue",
    "blvd": "boulevard",
    "ln": "lane",
    "dr": "drive",
    "ct": "court",
    "trl": "trail",
    "pkwy": "parkway",
}

ORDINAL_WORDS = {
    "first": "1st",
    "second": "2nd",
    "third": "3rd",
    "fourth": "4th",
    "fifth": "5th",
    "sixth": "6th",
    "seventh": "7th",
    "eighth": "8th",
    "ninth": "9th",
    "tenth": "10th",
}


# -----------------------------------------------------------------------------
# Repo-root-safe path helpers
# -----------------------------------------------------------------------------
def repo_root() -> str:
    # scripts/convert_to_geojson_kingpin.py -> scripts -> repo root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def root_path(*parts: str) -> str:
    return os.path.join(repo_root(), *parts)


# -----------------------------------------------------------------------------
# Normalization helpers
# -----------------------------------------------------------------------------
def _clean_ws(s: Any) -> str:
    return _WS_RE.sub(" ", str(s or "").strip())


def _strip_quotes(s: Any) -> str:
    s2 = _clean_ws(s)
    if (s2.startswith('"') and s2.endswith('"')) or (s2.startswith("'") and s2.endswith("'")):
        return s2[1:-1].strip()
    return s2


def normalize_state(s: Any) -> str:
    return _clean_ws(s).upper()


def normalize_zip(s: Any) -> str:
    return _clean_ws(s)


def normalize_city(s: Any) -> str:
    s2 = _clean_ws(s).lower()
    s2 = _PUNCT_RE.sub(" ", s2)
    return _clean_ws(s2)


def normalize_retailer(raw: Any) -> str:
    """
    IMPORTANT: This is for MATCHING KEYS, not display.
    We intentionally normalize common cooperative variants to reduce false TBD.
    """
    s = _clean_ws(raw)
    s = DASH_STATE_SUFFIX_RE.sub("", s)  # remove trailing " - IA" etc
    s = s.lower()
    s = s.replace("&", " and ")
    s = _PUNCT_RE.sub(" ", s)
    s = _clean_ws(s)

    tokens = s.split(" ")
    out: List[str] = []
    for t in tokens:
        if t in ("co", "co-op", "coop", "cooperative", "cooperatives"):
            out.append("cooperative")
        elif t in ("inc", "incorporated"):
            out.append("inc")
        elif t in ("company", "co."):
            out.append("co")
        else:
            out.append(t)
    return _clean_ws(" ".join(out))


def normalize_address(raw: Any) -> str:
    s = _clean_ws(raw).lower()
    s = _PUNCT_RE.sub(" ", s)
    s = _clean_ws(s)

    tokens = s.split(" ")
    tokens = [ORDINAL_WORDS.get(t, t) for t in tokens]
    tokens = [TOKEN_MAP.get(t, t) for t in tokens]
    return _clean_ws(" ".join(tokens))


def canonical_suppliers(raw: Any) -> str:
    s = _clean_ws(raw)
    if not s:
        return ""
    parts = re.split(r"[;,]", s)
    parts = [_clean_ws(p) for p in parts if _clean_ws(p)]
    return ", ".join(parts)


def canonicalize_category(raw: Any) -> str:
    """
    Canonical categories (Bailey Rule set):
      Agronomy, Grain/Feed, C-Store/Service/Energy, Distribution, Corporate HQ, Kingpin
    Treat nan/none/null as missing.
    """
    s = _clean_ws(raw)
    if not s:
        return ""
    low = s.lower()

    if low in {"nan", "none", "null"}:
        return ""

    if "corporate" in low or "hq" in low:
        return "Corporate HQ"
    if "distribution" in low:
        return "Distribution"
    if "c-store" in low or "c store" in low or "service" in low or "energy" in low:
        return "C-Store/Service/Energy"
    if "grain" in low or "feed" in low:
        return "Grain/Feed"
    if "agronomy" in low:
        return "Agronomy"
    if "kingpin" in low:
        return "Kingpin"

    if "," in s:
        s = s.split(",")[0].strip()
    return s


def is_blank_row(row: Dict[str, Any]) -> bool:
    core = [
        "Retailer",
        "ContactName",
        "Address",
        "City",
        "State",
        "Zip",
        "Email",
        "OfficePhone",
        "CellPhone",
        "LAT",
        "LON",
        "Latitude",
        "Longitude",
    ]
    return all(not _clean_ws(row.get(k, "")) for k in core)


def has_min_required(row: Dict[str, Any]) -> bool:
    return all(bool(_clean_ws(row.get(k, ""))) for k in KINGPIN_REQUIRED_MIN)


def _parse_float_maybe(v: Any) -> Optional[float]:
    s = _clean_ws(v)
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def row_has_coords(row: Dict[str, Any]) -> bool:
    # Accept either LAT/LON or Latitude/Longitude
    lat = _parse_float_maybe(row.get("LAT", "")) or _parse_float_maybe(row.get("Latitude", ""))
    lon = _parse_float_maybe(row.get("LON", "")) or _parse_float_maybe(row.get("Longitude", ""))
    return lat is not None and lon is not None


def get_row_lonlat(row: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    lat = _parse_float_maybe(row.get("LAT", "")) or _parse_float_maybe(row.get("Latitude", ""))
    lon = _parse_float_maybe(row.get("LON", "")) or _parse_float_maybe(row.get("Longitude", ""))
    if lat is None or lon is None:
        return None
    return (lon, lat)


# -----------------------------------------------------------------------------
# Index keys
# -----------------------------------------------------------------------------
def address_key(retailer: str, address: str, city: str, state: str, zipc: str) -> str:
    return f"{retailer}|{address}|{city}|{state}|{zipc}"


def city_key(retailer: str, city: str, state: str, zipc: str) -> str:
    return f"{retailer}|{city}|{state}|{zipc}"


def retailer_state_key(retailer: str, state: str) -> str:
    return f"{retailer}|{state}"


# -----------------------------------------------------------------------------
# Facility model + loaders
# -----------------------------------------------------------------------------
@dataclass
class Facility:
    retailer_raw: str
    retailer_norm: str
    name: str
    address_raw: str
    address_norm: str
    city_raw: str
    city_norm: str
    state: str
    zipc: str
    category: str
    suppliers: str
    longname: str
    lon: float
    lat: float


def load_retailers_geojson(path: str) -> List[Facility]:
    with open(path, "r", encoding="utf-8") as f:
        doc = json.load(f)

    out: List[Facility] = []
    for feat in doc.get("features", []):
        if (feat or {}).get("type") != "Feature":
            continue
        geom = (feat or {}).get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates") or []
        if not isinstance(coords, list) or len(coords) != 2:
            continue

        try:
            lon, lat = float(coords[0]), float(coords[1])
        except Exception:
            continue

        props = (feat or {}).get("properties") or {}

        r_raw = _clean_ws(props.get("Retailer", ""))
        a_raw = _clean_ws(props.get("Address", ""))
        c_raw = _clean_ws(props.get("City", ""))
        st = normalize_state(props.get("State", ""))
        z = normalize_zip(props.get("Zip", ""))

        cat_raw = props.get("Category", "")
        cat = canonicalize_category(cat_raw)
        supp = canonical_suppliers(props.get("Suppliers", ""))
        name = _clean_ws(props.get("Name", ""))
        longname = _clean_ws(props.get("LongName", ""))

        # Require the fields we need for matching
        if not (r_raw and a_raw and c_raw and st and z):
            continue

        if not cat:
            cat = "Agronomy"

        out.append(
            Facility(
                retailer_raw=r_raw,
                retailer_norm=normalize_retailer(r_raw),
                name=name,
                address_raw=a_raw,
                address_norm=normalize_address(a_raw),
                city_raw=c_raw,
                city_norm=normalize_city(c_raw),
                state=st,
                zipc=z,
                category=cat,
                suppliers=supp,
                longname=longname,
                lon=lon,
                lat=lat,
            )
        )
    return out


def build_facility_indexes(
    facilities: List[Facility],
) -> Tuple[Dict[str, List[Facility]], Dict[str, List[Facility]], Dict[str, List[Facility]]]:
    by_addr: Dict[str, List[Facility]] = {}
    by_city: Dict[str, List[Facility]] = {}
    by_retailer_state: Dict[str, List[Facility]] = {}

    for f in facilities:
        ak = address_key(f.retailer_norm, f.address_norm, f.city_norm, f.state, f.zipc)
        by_addr.setdefault(ak, []).append(f)

        ck = city_key(f.retailer_norm, f.city_norm, f.state, f.zipc)
        by_city.setdefault(ck, []).append(f)

        rk = retailer_state_key(f.retailer_norm, f.state)
        by_retailer_state.setdefault(rk, []).append(f)

    return by_addr, by_city, by_retailer_state


def choose_best_facility(cands: List[Facility]) -> Facility:
    """
    Choose a stable default when multiple facilities match.
    Preference:
      1) Corporate HQ (best for "retailer+state" fallback)
      2) Longer/more specific address
      3) Longer name/longname
    """

    def score(f: Facility) -> Tuple[int, int, int]:
        is_hq = 1 if f.category.lower() == "corporate hq".lower() else 0
        return (is_hq, len(f.address_raw or ""), max(len(f.name or ""), len(f.longname or "")))

    return sorted(cands, key=score, reverse=True)[0]


# -----------------------------------------------------------------------------
# Kingpin XLSX reader (for both COMBINED + LATLONG)
# -----------------------------------------------------------------------------
def read_kingpins_xlsx(path: str) -> List[Dict[str, Any]]:
    xls = pd.ExcelFile(path)
    rows: List[Dict[str, Any]] = []

    for sh in xls.sheet_names:
        if sh.strip().startswith("_"):
            continue
        df = pd.read_excel(path, sheet_name=sh, dtype=str).fillna("")
        df.columns = [str(c).strip() for c in df.columns]

        # Build canonical 'State' by coalescing STATE.1 -> STATE (prefer non-empty)
        cols_upper = {str(c).strip().upper(): c for c in df.columns}
        state1 = df[cols_upper["STATE.1"]] if "STATE.1" in cols_upper else ""
        state0 = df[cols_upper["STATE"]] if "STATE" in cols_upper else ""
        if "STATE.1" in cols_upper or "STATE" in cols_upper:
            s1 = state1.astype(str).str.strip() if hasattr(state1, "astype") else ""
            df["State"] = state1.where(s1.ne(""), state0) if hasattr(state1, "where") else state0
            drop_cols = []
            if "STATE.1" in cols_upper:
                drop_cols.append(cols_upper["STATE.1"])
            if "STATE" in cols_upper:
                drop_cols.append(cols_upper["STATE"])
            drop_cols = [c for c in drop_cols if c in df.columns and c != "State"]
            if drop_cols:
                df = df.drop(columns=drop_cols)

        # Header normalization
        col_map: Dict[str, str] = {}
        for c in df.columns:
            cu = str(c).strip().upper()
            if cu == "RETAILER":
                col_map[c] = "Retailer"
            elif cu in ("CONTACT NAME", "CONTACTNAME"):
                col_map[c] = "ContactName"
            elif cu == "ADDRESS":
                col_map[c] = "Address"
            elif cu == "CITY":
                col_map[c] = "City"
            elif cu in ("STATE.1", "STATE"):
                col_map[c] = "State"
            elif cu in ("ZIP", "ZIP CODE", "ZIPCODE"):
                col_map[c] = "Zip"
            elif cu in ("OFFICE PHONE", "OFFICEPHONE"):
                col_map[c] = "OfficePhone"
            elif cu in ("CELL PHONE", "CELLPHONE"):
                col_map[c] = "CellPhone"
            elif cu == "EMAIL":
                col_map[c] = "Email"
            elif cu in ("TITLE", "CONTACT TITLE", "CONTACTTITLE"):
                col_map[c] = "ContactTitle"
            elif cu in ("SUPPLIER", "SUPPLIERS"):
                col_map[c] = "Suppliers"
            elif cu in ("FULL BLOCK ADDRESS", "FULLADDRESS", "FULL ADDRESS"):
                col_map[c] = "FullAddress"
            elif cu in ("LAT", "LATITUDE"):
                col_map[c] = "LAT"
            elif cu in ("LON", "LONGITUDE", "LNG"):
                col_map[c] = "LON"
            elif cu == "GEOCODE_STATUS":
                col_map[c] = "GEOCODE_STATUS"
            elif cu == "GEOCODE_QUERY":
                col_map[c] = "GEOCODE_QUERY"

        if col_map:
            df = df.rename(columns=col_map)
            if "State" in df.columns:
                cols = list(df.columns)
                idxs = [k for k, x in enumerate(cols) if x == "State"]
                if len(idxs) > 1:
                    df = df.drop(df.columns[idxs[:-1]], axis=1)

        for _, r in df.iterrows():
            def _canon_key(_k: str) -> str:
                ku = str(_k).strip().upper()
                if ku == "RETAILER":
                    return "Retailer"
                if ku in ("CONTACT NAME", "CONTACTNAME"):
                    return "ContactName"
                if ku == "ADDRESS":
                    return "Address"
                if ku == "CITY":
                    return "City"
                if ku in ("STATE.1", "STATE"):
                    return "State"
                if ku in ("ZIP", "ZIP CODE", "ZIPCODE"):
                    return "Zip"
                if ku in ("OFFICE PHONE", "OFFICEPHONE"):
                    return "OfficePhone"
                if ku in ("CELL PHONE", "CELLPHONE"):
                    return "CellPhone"
                if ku == "EMAIL":
                    return "Email"
                if ku in ("TITLE", "CONTACT TITLE", "CONTACTTITLE"):
                    return "ContactTitle"
                if ku in ("SUPPLIER", "SUPPLIERS"):
                    return "Suppliers"
                if ku in ("FULL BLOCK ADDRESS", "FULLADDRESS", "FULL ADDRESS"):
                    return "FullAddress"
                if ku in ("LAT", "LATITUDE"):
                    return "LAT"
                if ku in ("LON", "LONGITUDE", "LNG"):
                    return "LON"
                if ku == "GEOCODE_STATUS":
                    return "GEOCODE_STATUS"
                if ku == "GEOCODE_QUERY":
                    return "GEOCODE_QUERY"
                return str(_k).strip()

            d = {_canon_key(k): ("" if pd.isna(v) else str(v)) for k, v in r.to_dict().items()}

            if not d.get("State"):
                st = ""
                for k in ("STATE.1", "STATE", "State", "STATE.1 ", "STATE ", "STATE.1.1"):
                    try:
                        v = r.get(k, "")
                    except Exception:
                        v = ""
                    ss = str(v).strip() if v is not None else ""
                    if ss and ss.lower() != "nan":
                        st = ss
                        break
                d["State"] = st

            d["_Sheet"] = sh
            rows.append(d)

    return rows


# -----------------------------------------------------------------------------
# Build a coordinate index from kingpin_latlong.xlsx
# -----------------------------------------------------------------------------
def _norm_key_for_coords(row: Dict[str, Any]) -> Tuple[str, str, str, str, str]:
    r_raw = _clean_ws(row.get("Retailer", ""))
    addr_raw = _clean_ws(row.get("Address", "")) or _clean_ws(row.get("FULL BLOCK ADDRESS", "")) or _clean_ws(row.get("FullAddress", ""))
    city_raw = _clean_ws(row.get("City", ""))
    state = normalize_state(row.get("State", ""))
    zipc = normalize_zip(row.get("Zip", ""))

    r_norm = normalize_retailer(r_raw)
    a_norm = normalize_address(addr_raw)
    c_norm = normalize_city(city_raw)
    return (r_norm, a_norm, c_norm, state, zipc)


def build_coords_index(latlong_rows: List[Dict[str, Any]]) -> Dict[str, Tuple[float, float]]:
    """
    Index is keyed by our normalized address_key(...) so convert step can attach coords
    even when the base COMBINED row is missing some fields.
    """
    idx: Dict[str, Tuple[float, float]] = {}
    for row in latlong_rows:
        lonlat = get_row_lonlat(row)
        if lonlat is None:
            continue
        r_norm, a_norm, c_norm, st, z = _norm_key_for_coords(row)
        if not (r_norm and a_norm and c_norm and st and z):
            continue
        ak = address_key(r_norm, a_norm, c_norm, st, z)
        # If duplicates exist, keep the first stable value (or overwrite — either is fine).
        idx.setdefault(ak, lonlat)
    return idx


# -----------------------------------------------------------------------------
# File IO helpers
# -----------------------------------------------------------------------------
def ensure_out_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def write_csv(path: str, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def build_geojson_feature(lon: float, lat: float, props: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


# -----------------------------------------------------------------------------
# Token resolution
# -----------------------------------------------------------------------------
def _extract_token_from_obj(obj: Any) -> str:
    if isinstance(obj, str):
        return _strip_quotes(obj)
    if isinstance(obj, dict):
        # Prefer a dedicated geocoding token if present
        for k in [
            "MAPBOX_TOKEN_FOR_GEOCODING",
            "MAPBOX_ACCESS_TOKEN",
            "MAPBOX_TOKEN",
            "token",
            "access_token",
            "NEXT_PUBLIC_MAPBOX_TOKEN",
        ]:
            if k in obj and obj[k]:
                return _strip_quotes(str(obj[k]))
    return ""


def load_token_from_json(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8-sig") as f:  # BOM-safe
            obj = json.load(f)
        return _extract_token_from_obj(obj)
    except Exception:
        return ""


def load_token_from_txt(path: str) -> str:
    """
    Supports:
      - raw token (pk....)
      - token=pk....
      - JSON string: {"MAPBOX_TOKEN":"pk...."}  (even if saved in .txt)
    BOM-safe via utf-8-sig.
    """
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            raw = f.read().strip()
        raw = _strip_quotes(raw)

        if raw.startswith("{") and raw.endswith("}"):
            try:
                obj = json.loads(raw)
                t = _extract_token_from_obj(obj)
                if t:
                    return t
            except Exception:
                pass

        raw = re.sub(
            r"^\s*(token|access_token|mapbox_access_token|mapbox_token|next_public_mapbox_token|mapbox_token_for_geocoding)\s*=\s*",
            "",
            raw,
            flags=re.IGNORECASE,
        ).strip()
        return raw
    except Exception:
        return ""


def resolve_mapbox_token(token_file: Optional[str]) -> Tuple[str, str]:
    # ENV first (best practice for secrets)
    t = (
        os.getenv("MAPBOX_TOKEN")
        or os.getenv("MAPBOX_ACCESS_TOKEN")
        or os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN")
        or ""
    )
    if t:
        return _strip_quotes(t), "env"

    # token file provided explicitly
    if token_file:
        tf = token_file
        if not os.path.isabs(tf):
            tf = root_path(tf)
        if tf.lower().endswith(".json"):
            t2 = load_token_from_json(tf)
        else:
            t2 = load_token_from_txt(tf)
        if t2:
            return t2, f"--token-file:{tf}"

    # default token files (repo root /data)
    tf_txt = root_path("data", "token.txt")
    tf_json = root_path("data", "token.json")

    if os.path.exists(tf_txt):
        t3 = load_token_from_txt(tf_txt)
        if t3:
            return t3, tf_txt

    if os.path.exists(tf_json):
        t4 = load_token_from_json(tf_json)
        if t4:
            return t4, tf_json

    return "", "none"


# -----------------------------------------------------------------------------
# Geocode cache
# -----------------------------------------------------------------------------
def load_geocode_cache(path: str) -> Dict[str, List[float]]:
    try:
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict):
            return obj
        return {}
    except Exception:
        return {}


def save_geocode_cache(path: str, cache: Dict[str, List[float]]) -> None:
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def cache_key_full(address: str, city: str, state: str, zipc: str) -> str:
    return _clean_ws(f"{address}, {city}, {state} {zipc}").lower()


# -----------------------------------------------------------------------------
# Mapbox geocoding
# -----------------------------------------------------------------------------
def geocode_address_mapbox(
    token: str,
    address: str,
    city: str,
    state: str,
    zipc: str,
    *,
    country: str = "US",
    limit: int = 1,
    sleep_s: float = 0.12,
) -> Tuple[Optional[Tuple[float, float]], int, str]:
    query = f"{address}, {city}, {state} {zipc}"
    url = MAPBOX_GEOCODE_URL.format(query=requests.utils.quote(query))
    params = {"access_token": token, "country": country, "limit": str(limit)}

    try:
        r = requests.get(url, params=params, timeout=25)
        status = r.status_code
        if status != 200:
            return None, status, (r.text or "").strip()[:180]
        data = r.json()
        feats = data.get("features", [])
        if not feats:
            return None, status, "NO_FEATURES"
        center = feats[0].get("center")
        if not center or len(center) != 2:
            return None, status, "BAD_CENTER"
        lon, lat = float(center[0]), float(center[1])
        if sleep_s > 0:
            time.sleep(sleep_s)
        return (lon, lat), status, "OK"
    except Exception as e:
        return None, 0, f"EXCEPTION: {type(e).__name__}"


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Build kingpin.geojson (keep any row with coords; enrich via facilities; optional geocode for missing coords).")

    ap.add_argument(
        "--kingpin-xlsx",
        default=root_path("data", "kingpin_COMBINED.xlsx"),
        help="Path to kingpin xlsx (source contact data).",
    )
    ap.add_argument(
        "--kingpin-latlong-xlsx",
        default=root_path("data", "kingpin_latlong.xlsx"),
        help="Path to kingpin_latlong.xlsx (preferred kingpin coordinate authority).",
    )
    ap.add_argument(
        "--retailers-geojson",
        default=root_path("public", "data", "retailers.geojson"),
        help="Path to retailers.geojson (facility enrichment authority).",
    )
    ap.add_argument(
        "--out-geojson",
        default=root_path("public", "data", "kingpin.geojson"),
        help="Output path for kingpin.geojson.",
    )
    ap.add_argument(
        "--out-dir",
        default=root_path("scripts", "out"),
        help="Directory for audit outputs.",
    )
    ap.add_argument(
        "--geocode-no-match",
        action="store_true",
        help="If set: rows missing coords will be geocoded via Mapbox. Otherwise missing-coord rows are left unmatched/excluded.",
    )
    ap.add_argument(
        "--token-file",
        default="",
        help="Optional token file path (txt or json). BOM-safe; txt may be JSON.",
    )
    ap.add_argument("--geocode-sleep", type=float, default=0.12, help="Sleep seconds between Mapbox calls.")
    ap.add_argument("--debug-geocode-failures", type=int, default=5, help="Print first N geocode failures.")
    ap.add_argument(
        "--cache-file",
        default=root_path("data", "geocode-cache.json"),
        help="Geocode cache file.",
    )

    args = ap.parse_args()

    def _abs(p: str) -> str:
        if not p:
            return p
        return p if os.path.isabs(p) else root_path(p)

    args.kingpin_xlsx = _abs(args.kingpin_xlsx)
    args.kingpin_latlong_xlsx = _abs(args.kingpin_latlong_xlsx)
    args.retailers_geojson = _abs(args.retailers_geojson)
    args.out_geojson = _abs(args.out_geojson)
    args.out_dir = _abs(args.out_dir)
    args.cache_file = _abs(args.cache_file)
    if args.token_file:
        args.token_file = _abs(args.token_file)

    if not os.path.exists(args.retailers_geojson):
        print(f"❌ Missing retailers geojson: {args.retailers_geojson}")
        return 1
    if not os.path.exists(args.kingpin_xlsx):
        print(f"❌ Missing kingpin xlsx: {args.kingpin_xlsx}")
        return 1
    if not os.path.exists(args.kingpin_latlong_xlsx):
        print(f"❌ Missing kingpin_latlong xlsx: {args.kingpin_latlong_xlsx}")
        print("   Run: python .\\geocode_kingpin.py  (to generate /data/kingpin_latlong.xlsx)")
        return 1

    facilities = load_retailers_geojson(args.retailers_geojson)
    by_addr, by_city, by_retailer_state = build_facility_indexes(facilities)

    raw_rows = read_kingpins_xlsx(args.kingpin_xlsx)
    latlong_rows = read_kingpins_xlsx(args.kingpin_latlong_xlsx)
    coords_index = build_coords_index(latlong_rows)

    token = ""
    token_source = "n/a"
    if args.geocode_no_match:
        token, token_source = resolve_mapbox_token(args.token_file)
        if not token:
            print("❌ geocode-no-match enabled but no token found.")
            print("   Set MAPBOX_TOKEN env var (recommended) OR place token in data/token.txt|token.json OR pass --token-file.")
            return 1

    cache = load_geocode_cache(args.cache_file) if args.geocode_no_match else {}
    cache_hits = 0
    cache_writes = 0

    enriched: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []

    # Stats
    n_input_total = len(raw_rows)
    n_dropped_blank = 0
    n_dropped_missing_min = 0  # informational only now
    n_kept_due_to_coords = 0
    n_kept_missing_min_no_coords = 0

    n_t1 = 0
    n_t2 = 0
    n_t3 = 0
    n_tbd = 0

    n_coords_from_latlong = 0
    n_coords_from_facility = 0
    n_geocoded = 0
    n_geocode_failed = 0

    fail_status_counts: Dict[str, int] = {}
    printed_failures = 0

    for row in raw_rows:
        if is_blank_row(row):
            n_dropped_blank += 1
            continue

        # Build basic fields (even if some are blank)
        retailer_raw = _clean_ws(row.get("Retailer", ""))
        suppliers_raw = canonical_suppliers(row.get("Suppliers", ""))
        contact = _clean_ws(row.get("ContactName", ""))
        title = _clean_ws(row.get("Title", "")) or _clean_ws(row.get("ContactTitle", ""))
        email = _clean_ws(row.get("Email", ""))
        office = _clean_ws(row.get("OfficePhone", ""))
        cell = _clean_ws(row.get("CellPhone", ""))
        addr_raw = _clean_ws(row.get("Address", ""))
        city_raw = _clean_ws(row.get("City", ""))
        state = normalize_state(row.get("State", ""))
        zipc = normalize_zip(row.get("Zip", ""))
        fulladdr = _clean_ws(row.get("FullAddress", ""))

        # Matching keys (may be partially blank)
        r_norm = normalize_retailer(retailer_raw)
        a_norm = normalize_address(addr_raw)
        c_norm = normalize_city(city_raw)

        ak = address_key(r_norm, a_norm, c_norm, state, zipc)
        ck = city_key(r_norm, c_norm, state, zipc)
        rk = retailer_state_key(r_norm, state)

        # 1) Prefer coords from kingpin_latlong.xlsx index (authoritative for kingpins)
        lonlat: Optional[Tuple[float, float]] = coords_index.get(ak)
        if lonlat is not None:
            n_coords_from_latlong += 1

        # We still track "missing_min", but we do NOT drop the row if coords exist.
        missing_min = not has_min_required(
            {
                "Retailer": retailer_raw,
                "ContactName": contact,
                "Address": addr_raw,
                "City": city_raw,
                "State": state,
                "Zip": zipc,
            }
        )
        if missing_min:
            n_dropped_missing_min += 1
            if lonlat is not None:
                n_kept_due_to_coords += 1
            else:
                n_kept_missing_min_no_coords += 1

        # Facility enrichment / fallback coords (if latlong coords are missing)
        match_tier = "TBD"
        geosource = "MAPBOX"
        matched_fac: Optional[Facility] = None

        # Only attempt facility matching if we have enough to build meaningful keys
        # (otherwise it will just be empty keys and false misses).
        if r_norm and state:
            # T1: exact addr match
            if a_norm and c_norm and zipc:
                cands1 = by_addr.get(ak, [])
                if cands1:
                    matched_fac = choose_best_facility(cands1)
                    match_tier = "T1"
                    geosource = "FACILITY"
                    n_t1 += 1

            # T2: unique city match
            if matched_fac is None and c_norm and zipc:
                cands2 = by_city.get(ck, [])
                if len(cands2) == 1:
                    matched_fac = cands2[0]
                    match_tier = "T2"
                    geosource = "FACILITY"
                    n_t2 += 1

            # T3: retailer+state fallback
            if matched_fac is None:
                cands3 = by_retailer_state.get(rk, [])
                if cands3:
                    matched_fac = choose_best_facility(cands3)
                    match_tier = "T3"
                    geosource = "FACILITY"
                    n_t3 += 1

        props: Dict[str, Any] = {
            "Retailer": retailer_raw,
            "Suppliers": suppliers_raw,
            "ContactName": contact,
            "ContactTitle": title,
            "Title": title,
            "Email": email,
            "OfficePhone": office,
            "CellPhone": cell,
            "Address": addr_raw,
            "City": city_raw,
            "State": state,
            "Zip": zipc,
        }
        if fulladdr:
            props["FullAddress"] = fulladdr

        # Apply facility enrichment fields (category/suppliers/longname), even if we already have latlong coords.
        if matched_fac is not None:
            props["Category"] = matched_fac.category or "Agronomy"
            props["FacilityName"] = matched_fac.name
            props["LongName"] = matched_fac.longname
            props["MatchTier"] = match_tier
            props["GeoSource"] = geosource

            fac_supp = canonical_suppliers(matched_fac.suppliers)
            if fac_supp and fac_supp.upper() != "TBD":
                props["Suppliers"] = fac_supp

            # Only fall back to facility coords if latlong coords are missing
            if lonlat is None:
                lonlat = (matched_fac.lon, matched_fac.lat)
                n_coords_from_facility += 1

        else:
            n_tbd += 1
            props["Category"] = "Agronomy"
            props["FacilityName"] = ""
            props["LongName"] = ""
            props["MatchTier"] = "TBD"
            props["GeoSource"] = "KINGPIN_LATLONG" if lonlat is not None else "MAPBOX"

        # If still missing coords, optionally geocode (only when enabled)
        if lonlat is None and args.geocode_no_match and addr_raw and city_raw and state and zipc:
            ck_full = cache_key_full(addr_raw, city_raw, state, zipc)

            if ck_full in cache and isinstance(cache[ck_full], list) and len(cache[ck_full]) == 2:
                try:
                    lonlat = (float(cache[ck_full][0]), float(cache[ck_full][1]))
                    cache_hits += 1
                except Exception:
                    lonlat = None

            if lonlat is None:
                gl, status, reason = geocode_address_mapbox(
                    token=token,
                    address=addr_raw,
                    city=city_raw,
                    state=state,
                    zipc=zipc,
                    sleep_s=max(0.0, args.geocode_sleep),
                )
                if gl:
                    lonlat = gl
                    n_geocoded += 1
                    cache[ck_full] = [float(gl[0]), float(gl[1])]
                    cache_writes += 1
                    props["GeoSource"] = "MAPBOX"
                else:
                    n_geocode_failed += 1
                    k = str(status)
                    fail_status_counts[k] = fail_status_counts.get(k, 0) + 1
                    if printed_failures < args.debug_geocode_failures:
                        printed_failures += 1
                        print(
                            f"⚠️  Geocode failed [{status}] {reason} :: "
                            f"{addr_raw}, {city_raw}, {state} {zipc} (Retailer: {retailer_raw})"
                        )

        if lonlat is not None:
            enriched.append({**props, "Longitude": str(lonlat[0]), "Latitude": str(lonlat[1])})
        else:
            unmatched.append(props)

    ensure_out_dir(args.out_dir)

    enriched_fields = [
        "Retailer",
        "Suppliers",
        "ContactName",
        "ContactTitle",
        "Title",
        "Email",
        "OfficePhone",
        "CellPhone",
        "Address",
        "City",
        "State",
        "Zip",
        "Category",
        "FacilityName",
        "LongName",
        "MatchTier",
        "GeoSource",
        "Longitude",
        "Latitude",
        "FullAddress",
    ]
    write_csv(os.path.join(args.out_dir, "kingpin_enriched.csv"), enriched, enriched_fields)

    unmatched_fields = [
        "Retailer",
        "Suppliers",
        "ContactName",
        "ContactTitle",
        "Title",
        "Email",
        "OfficePhone",
        "CellPhone",
        "Address",
        "City",
        "State",
        "Zip",
        "Category",
        "FacilityName",
        "LongName",
        "MatchTier",
        "GeoSource",
        "FullAddress",
    ]
    write_csv(os.path.join(args.out_dir, "kingpin_unmatched.csv"), unmatched, unmatched_fields)

    # Build GeoJSON features
    features: List[Dict[str, Any]] = []
    for r in enriched:
        try:
            lon = float(r.get("Longitude", ""))
            lat = float(r.get("Latitude", ""))
        except Exception:
            continue
        props_out = {k: v for k, v in r.items() if k not in ("Longitude", "Latitude")}
        features.append(build_geojson_feature(lon, lat, props_out))

    out_doc = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(args.out_geojson), exist_ok=True)
    with open(args.out_geojson, "w", encoding="utf-8") as f:
        json.dump(out_doc, f, ensure_ascii=False, indent=2)

    if args.geocode_no_match and cache_writes:
        save_geocode_cache(args.cache_file, cache)

    stats = {
        "input_rows_total_including_blanks": n_input_total,
        "rows_dropped_blank": n_dropped_blank,
        "rows_missing_min_fields": n_dropped_missing_min,
        "rows_kept_due_to_coords_even_if_missing_min": n_kept_due_to_coords,
        "rows_missing_min_and_no_coords": n_kept_missing_min_no_coords,
        "matched_t1": n_t1,
        "matched_t2": n_t2,
        "matched_t3": n_t3,
        "tbd_rows": n_tbd,
        "coords_from_kingpin_latlong": n_coords_from_latlong,
        "coords_from_facility_fallback": n_coords_from_facility,
        "tbd_geocoded": n_geocoded,
        "tbd_geocode_failed": n_geocode_failed,
        "geocode_fail_status_counts": fail_status_counts,
        "cache_file": args.cache_file,
        "cache_hits": cache_hits,
        "cache_writes": cache_writes,
        "output_features": len(features),
        "out_geojson": args.out_geojson,
        "out_enriched_csv": os.path.join(args.out_dir, "kingpin_enriched.csv"),
        "out_unmatched_csv": os.path.join(args.out_dir, "kingpin_unmatched.csv"),
        "token_source": token_source,
    }

    with open(os.path.join(args.out_dir, "kingpin_build_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print("✅ kingpin.geojson build complete")
    print(json.dumps(stats, indent=2))

    # Helpful sanity cue (the number you care about)
    if stats["coords_from_kingpin_latlong"] > 0:
        print(
            f"\n🔎 Sanity: coords_from_kingpin_latlong={stats['coords_from_kingpin_latlong']} "
            f"→ output_features={stats['output_features']}\n"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
