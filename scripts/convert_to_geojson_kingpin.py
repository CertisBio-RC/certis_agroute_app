#!/usr/bin/env python3
"""
CERTIS AGROUTE — Build public/data/kingpin.geojson (Hybrid, Bailey-safe)

GOAL (fixed):
  ✅ Do NOT “lose Kingpins” just because some spreadsheet fields are blank.
  ✅ If a row has usable coordinates (from kingpin_latlong.xlsx), it becomes a feature.
  ✅ Tier matching (T1/T2/T3) is used to ENRICH/LABEL, not to INCLUDE/EXCLUDE.
  ✅ TBD rows can optionally geocode (only when coords are missing) via --geocode-no-match.

NEW (Jan 2026): REMOTE KINGPIN SANITY + AREA CODE FALLBACK
  ✅ Hard-drop any rows with invalid coordinates (NaN/inf/out-of-range/non-numeric).
  ✅ If missing address (no Address/City/State/Zip usable) BUT phone exists:
        - derive area code (NPA)
        - look up population center via: data/area_code_centers.csv
        - assign City/State/Zip + coords (lon/lat)
  ✅ If missing address AND no phone → ignore (drop) per your rule.

DATA FLOW (Bailey rules honored):
  - Excel inputs live in /data
  - Output GeoJSON is written to: public/data/kingpin.geojson
  - Audit outputs: scripts/out/kingpin_enriched.csv, kingpin_unmatched.csv, kingpin_build_stats.json

Inputs:
  - data/kingpin_COMBINED.xlsx        (contact/retailer data)
  - data/kingpin_latlong.xlsx         (preferred coordinate authority for kingpins)
  - public/data/retailers.geojson     (facility enrichment authority for Category/Suppliers/coords fallback)
  - data/area_code_centers.csv        (optional; for remote/no-address kingpins)

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
import math
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

PHONE_DIGITS_RE = re.compile(r"\D+")


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


# -----------------------------------------------------------------------------
# Coordinate safety
# -----------------------------------------------------------------------------
def _parse_float_maybe(v: Any) -> Optional[float]:
    s = _clean_ws(v)
    if not s:
        return None
    try:
        x = float(s)
        return x
    except Exception:
        return None


def _is_valid_lonlat(lon: float, lat: float) -> bool:
    if lon is None or lat is None:
        return False
    if isinstance(lon, float) and (math.isnan(lon) or math.isinf(lon)):
        return False
    if isinstance(lat, float) and (math.isnan(lat) or math.isinf(lat)):
        return False
    if not (-180.0 <= lon <= 180.0):
        return False
    if not (-90.0 <= lat <= 90.0):
        return False
    return True


def get_row_lonlat(row: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    lat = _parse_float_maybe(row.get("LAT", "")) or _parse_float_maybe(row.get("Latitude", ""))
    lon = _parse_float_maybe(row.get("LON", "")) or _parse_float_maybe(row.get("Longitude", ""))
    if lat is None or lon is None:
        return None
    if not _is_valid_lonlat(lon, lat):
        return None
    return (lon, lat)


# -----------------------------------------------------------------------------
# Area code fallback (remote kingpins)
# -----------------------------------------------------------------------------
def _digits_only(phone: str) -> str:
    return PHONE_DIGITS_RE.sub("", phone or "")


def extract_area_code(office_phone: str, cell_phone: str) -> str:
    """
    Try to extract NPA (area code) from office/cell phone.
    Accepts common US formats; ignores +1 prefix.
    Returns 3-digit string or "".
    """
    for raw in (office_phone, cell_phone):
        d = _digits_only(_clean_ws(raw))
        if not d:
            continue
        # strip leading country code
        if len(d) == 11 and d.startswith("1"):
            d = d[1:]
        if len(d) >= 10:
            npa = d[:3]
            if len(npa) == 3 and npa.isdigit():
                return npa
    return ""


def load_area_code_centers(path: str) -> Dict[str, Dict[str, Any]]:
    """
    Optional CSV mapping: AREA_CODE,CITY,STATE,ZIP,LAT,LON
    Returns dict: { "651": {"City":..., "State":..., "Zip":..., "LAT":..., "LON":...}, ... }
    """
    if not os.path.exists(path):
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            ac = _clean_ws(row.get("AREA_CODE", "") or row.get("AreaCode", "")).strip()
            if not ac or not ac.isdigit() or len(ac) != 3:
                continue
            city = _clean_ws(row.get("CITY", "") or row.get("City", ""))
            st = normalize_state(row.get("STATE", "") or row.get("State", ""))
            z = _clean_ws(row.get("ZIP", "") or row.get("Zip", ""))
            lat = _parse_float_maybe(row.get("LAT", "") or row.get("Latitude", ""))
            lon = _parse_float_maybe(row.get("LON", "") or row.get("Longitude", ""))
            if lat is None or lon is None:
                continue
            if not _is_valid_lonlat(lon, lat):
                continue
            out[ac] = {"City": city, "State": st, "Zip": z, "LAT": float(lat), "LON": float(lon)}
    return out


def is_address_usable(addr: str, city: str, st: str, zipc: str, fulladdr: str = "") -> bool:
    """
    Treat as usable if we have enough for a real place query / match.
    (FullAddress counts, but phone-only remote employees often have nothing here.)
    """
    if _clean_ws(fulladdr):
        return True
    if _clean_ws(addr) and _clean_ws(city) and _clean_ws(st):
        return True
    # zip alone is not enough
    return False


# -----------------------------------------------------------------------------
# Index keys
# -----------------------------------------------------------------------------
def address_key(retailer: str, address: str, city: str, state: str, zipc: str) -> str:
    return f"{retailer}|{address}|{city}|{state}|{zipc}"


def addr_no_zip_key(retailer: str, address: str, city: str, state: str) -> str:
    return f"{retailer}|{address}|{city}|{state}"


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
        if not _is_valid_lonlat(lon, lat):
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
# Build coordinate indexes from kingpin_latlong.xlsx
# -----------------------------------------------------------------------------
def _best_addr_source(row: Dict[str, Any]) -> str:
    """
    Prefer Address, else FullAddress (which is the normalized name for FULL BLOCK ADDRESS),
    else empty.
    """
    addr = _clean_ws(row.get("Address", ""))
    if addr:
        return addr
    full = _clean_ws(row.get("FullAddress", ""))
    if full:
        return full
    # legacy guards
    legacy = (
        _clean_ws(row.get("FULL BLOCK ADDRESS", ""))
        or _clean_ws(row.get("FULLADDRESS", ""))
        or _clean_ws(row.get("FULL ADDRESS", ""))
    )
    return legacy


def _norm_parts_for_coords(row: Dict[str, Any]) -> Tuple[str, str, str, str, str]:
    r_raw = _clean_ws(row.get("Retailer", ""))
    addr_raw = _best_addr_source(row)
    city_raw = _clean_ws(row.get("City", ""))
    state = normalize_state(row.get("State", ""))
    zipc = normalize_zip(row.get("Zip", ""))

    r_norm = normalize_retailer(r_raw)
    a_norm = normalize_address(addr_raw)
    c_norm = normalize_city(city_raw)
    return (r_norm, a_norm, c_norm, state, zipc)


def build_coords_indexes(
    latlong_rows: List[Dict[str, Any]],
) -> Tuple[
    Dict[str, Tuple[float, float]],
    Dict[str, List[Tuple[float, float]]],
    Dict[str, List[Tuple[float, float]]],
    Dict[str, List[Tuple[float, float]]],
]:
    """
    Returns:
      idx_addr:        full address_key -> lonlat (first stable)
      idx_addr_nozip:  addr_no_zip_key -> [lonlat,...]
      idx_city:        city_key -> [lonlat,...]
      idx_retailer_st: retailer_state_key -> [lonlat,...]
    """
    idx_addr: Dict[str, Tuple[float, float]] = {}
    idx_addr_nozip: Dict[str, List[Tuple[float, float]]] = {}
    idx_city: Dict[str, List[Tuple[float, float]]] = {}
    idx_retailer_st: Dict[str, List[Tuple[float, float]]] = {}

    for row in latlong_rows:
        lonlat = get_row_lonlat(row)
        if lonlat is None:
            continue

        r_norm, a_norm, c_norm, st, z = _norm_parts_for_coords(row)
        if not (r_norm and st):
            continue

        if a_norm and c_norm and z:
            ak = address_key(r_norm, a_norm, c_norm, st, z)
            idx_addr.setdefault(ak, lonlat)

        if a_norm and c_norm:
            anz = addr_no_zip_key(r_norm, a_norm, c_norm, st)
            idx_addr_nozip.setdefault(anz, []).append(lonlat)

        if c_norm and z:
            ck = city_key(r_norm, c_norm, st, z)
            idx_city.setdefault(ck, []).append(lonlat)

        rk = retailer_state_key(r_norm, st)
        idx_retailer_st.setdefault(rk, []).append(lonlat)

    return idx_addr, idx_addr_nozip, idx_city, idx_retailer_st


def _unique_lonlat(lst: List[Tuple[float, float]]) -> Optional[Tuple[float, float]]:
    if not lst:
        return None
    uniq = list({(round(x[0], 7), round(x[1], 7)) for x in lst})
    if len(uniq) == 1:
        return (float(uniq[0][0]), float(uniq[0][1]))
    return None


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
        with open(path, "r", encoding="utf-8-sig") as f:
            obj = json.load(f)
        return _extract_token_from_obj(obj)
    except Exception:
        return ""


def load_token_from_txt(path: str) -> str:
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
    t = os.getenv("MAPBOX_TOKEN") or os.getenv("MAPBOX_ACCESS_TOKEN") or os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN") or ""
    if t:
        return _strip_quotes(t), "env"

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
        if not _is_valid_lonlat(lon, lat):
            return None, status, "INVALID_COORDS"
        if sleep_s > 0:
            time.sleep(sleep_s)
        return (lon, lat), status, "OK"
    except Exception as e:
        return None, 0, f"EXCEPTION: {type(e).__name__}"


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Build kingpin.geojson (keep any row with valid coords; enrich via facilities; optional geocode for missing coords; remote-phone fallback via area code centers)."
    )

    ap.add_argument("--kingpin-xlsx", default=root_path("data", "kingpin_COMBINED.xlsx"))
    ap.add_argument("--kingpin-latlong-xlsx", default=root_path("data", "kingpin_latlong.xlsx"))
    ap.add_argument("--retailers-geojson", default=root_path("public", "data", "retailers.geojson"))
    ap.add_argument("--out-geojson", default=root_path("public", "data", "kingpin.geojson"))
    ap.add_argument("--out-dir", default=root_path("scripts", "out"))

    ap.add_argument(
        "--area-code-centers",
        default=root_path("data", "area_code_centers.csv"),
        help="Optional mapping CSV: AREA_CODE,CITY,STATE,ZIP,LAT,LON. Used when address is missing but phone exists.",
    )

    ap.add_argument(
        "--geocode-no-match",
        action="store_true",
        help="If set: rows missing coords will be geocoded via Mapbox. Otherwise missing-coord rows are excluded.",
    )
    ap.add_argument("--token-file", default="", help="Optional token file path (txt or json).")
    ap.add_argument("--geocode-sleep", type=float, default=0.12)
    ap.add_argument("--debug-geocode-failures", type=int, default=5)
    ap.add_argument("--cache-file", default=root_path("data", "geocode-cache.json"))

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
    args.area_code_centers = _abs(args.area_code_centers)
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

    # Optional area code centers
    area_centers = load_area_code_centers(args.area_code_centers)
    if area_centers:
        print(f"📍 Loaded area code centers: {len(area_centers)} (from {args.area_code_centers})")
    else:
        print(f"📍 Area code centers not loaded (file missing/empty): {args.area_code_centers}")

    facilities = load_retailers_geojson(args.retailers_geojson)
    by_addr, by_city, by_retailer_state = build_facility_indexes(facilities)

    raw_rows = read_kingpins_xlsx(args.kingpin_xlsx)
    latlong_rows = read_kingpins_xlsx(args.kingpin_latlong_xlsx)

    idx_addr, idx_addr_nozip, idx_city, idx_retailer_st = build_coords_indexes(latlong_rows)

    token = ""
    token_source = "n/a"
    if args.geocode_no_match:
        token, token_source = resolve_mapbox_token(args.token_file)
        if not token:
            print("❌ geocode-no-match enabled but no token found.")
            print("   Set MAPBOX_TOKEN env var OR place token in data/token.txt|token.json OR pass --token-file.")
            return 1

    cache = load_geocode_cache(args.cache_file) if args.geocode_no_match else {}
    cache_hits = 0
    cache_writes = 0

    enriched: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []

    # Stats
    n_input_total = len(raw_rows)
    n_dropped_blank = 0
    n_rows_missing_min_fields = 0

    n_kept_due_to_coords = 0
    n_missing_min_no_coords = 0

    n_t1 = 0
    n_t2 = 0
    n_t3 = 0
    n_tbd = 0

    n_coords_from_latlong = 0
    n_coords_from_latlong_nozip = 0
    n_coords_from_latlong_city = 0
    n_coords_from_latlong_retailer_state = 0

    n_coords_from_facility = 0
    n_geocoded = 0
    n_geocode_failed = 0

    n_area_code_assigned = 0
    n_dropped_no_address_no_phone = 0
    n_dropped_invalid_coords_final = 0

    fail_status_counts: Dict[str, int] = {}
    printed_failures = 0

    for row in raw_rows:
        if is_blank_row(row):
            n_dropped_blank += 1
            continue

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

        # Remote-kingpin rule: if no address AND no phone => ignore
        address_ok = is_address_usable(addr_raw, city_raw, state, zipc, fulladdr=fulladdr)
        phone_ok = bool(_clean_ws(office) or _clean_ws(cell))

        if not address_ok and not phone_ok:
            n_dropped_no_address_no_phone += 1
            continue

        # If no usable address but phone exists, attempt area code placement (if mapping loaded)
        if not address_ok and phone_ok:
            ac = extract_area_code(office, cell)
            if ac and ac in area_centers:
                cen = area_centers[ac]
                # fill in a human-readable “City Center …”
                city_raw = cen.get("City", "") or city_raw
                state = cen.get("State", "") or state
                zipc = cen.get("Zip", "") or zipc
                addr_raw = ""  # keep blank; we are intentionally a city-center placement
                fulladdr = f"City Center, {city_raw}, {state} {zipc}".strip(", ").strip()
                # create coords directly
                lonlat = (float(cen["LON"]), float(cen["LAT"]))
                n_area_code_assigned += 1
            else:
                # no mapping available -> drop (your instruction: must assign; otherwise ignore)
                n_dropped_no_address_no_phone += 1
                continue
        else:
            lonlat = None  # will compute below

        # Matching keys
        r_norm = normalize_retailer(retailer_raw)
        a_norm = normalize_address(addr_raw)
        c_norm = normalize_city(city_raw)

        ak = address_key(r_norm, a_norm, c_norm, state, zipc)
        anz = addr_no_zip_key(r_norm, a_norm, c_norm, state)
        ck = city_key(r_norm, c_norm, state, zipc)
        rk = retailer_state_key(r_norm, state)

        # If not already set by area-code placement, attempt coordinate attachment
        if "lonlat" not in locals() or lonlat is None:
            lonlat = None

            # Prefer coords from kingpin_latlong.xlsx (authoritative)
            if a_norm and c_norm and state and zipc:
                lonlat = idx_addr.get(ak)

            if lonlat is None and a_norm and c_norm and state:
                cand = _unique_lonlat(idx_addr_nozip.get(anz, []))
                if cand is not None:
                    lonlat = cand
                    n_coords_from_latlong_nozip += 1

            if lonlat is None and c_norm and state and zipc:
                cand = _unique_lonlat(idx_city.get(ck, []))
                if cand is not None:
                    lonlat = cand
                    n_coords_from_latlong_city += 1

            if lonlat is None and r_norm and state:
                cand = _unique_lonlat(idx_retailer_st.get(rk, []))
                if cand is not None:
                    lonlat = cand
                    n_coords_from_latlong_retailer_state += 1

            if lonlat is not None:
                n_coords_from_latlong += 1

        # Missing-min tracking (informational only)
        missing_min = not has_min_required(
            {"Retailer": retailer_raw, "ContactName": contact, "Address": addr_raw, "City": city_raw, "State": state, "Zip": zipc}
        )
        if missing_min:
            n_rows_missing_min_fields += 1
            if lonlat is not None:
                n_kept_due_to_coords += 1
            else:
                n_missing_min_no_coords += 1

        # Facility enrichment / fallback coords
        match_tier = "TBD"
        geosource = "MAPBOX"
        matched_fac: Optional[Facility] = None

        if r_norm and state:
            if a_norm and c_norm and zipc:
                cands1 = by_addr.get(ak, [])
                if cands1:
                    matched_fac = choose_best_facility(cands1)
                    match_tier = "T1"
                    geosource = "FACILITY"
                    n_t1 += 1

            if matched_fac is None and c_norm and zipc:
                cands2 = by_city.get(ck, [])
                if len(cands2) == 1:
                    matched_fac = cands2[0]
                    match_tier = "T2"
                    geosource = "FACILITY"
                    n_t2 += 1

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

        if matched_fac is not None:
            props["Category"] = matched_fac.category or "Agronomy"
            props["FacilityName"] = matched_fac.name
            props["LongName"] = matched_fac.longname
            props["MatchTier"] = match_tier
            props["GeoSource"] = geosource

            fac_supp = canonical_suppliers(matched_fac.suppliers)
            if fac_supp and fac_supp.upper() != "TBD":
                props["Suppliers"] = fac_supp

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

        # Optional Mapbox geocode (only when enabled AND address is usable)
        if lonlat is None and args.geocode_no_match and address_ok and addr_raw and city_raw and state and zipc:
            ck_full = cache_key_full(addr_raw, city_raw, state, zipc)

            if ck_full in cache and isinstance(cache[ck_full], list) and len(cache[ck_full]) == 2:
                try:
                    lonlat = (float(cache[ck_full][0]), float(cache[ck_full][1]))
                    if _is_valid_lonlat(lonlat[0], lonlat[1]):
                        cache_hits += 1
                    else:
                        lonlat = None
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

        # FINAL HARD FILTER: if coords are invalid -> drop
        if lonlat is not None:
            if not _is_valid_lonlat(lonlat[0], lonlat[1]):
                n_dropped_invalid_coords_final += 1
                continue
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

    # Build GeoJSON features (guaranteed valid)
    features: List[Dict[str, Any]] = []
    for r in enriched:
        try:
            lon = float(r.get("Longitude", ""))
            lat = float(r.get("Latitude", ""))
        except Exception:
            continue
        if not _is_valid_lonlat(lon, lat):
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
        "rows_missing_min_fields": n_rows_missing_min_fields,
        "rows_kept_due_to_coords_even_if_missing_min": n_kept_due_to_coords,
        "rows_missing_min_and_no_coords": n_missing_min_no_coords,
        "dropped_no_address_no_phone": n_dropped_no_address_no_phone,
        "area_code_assigned_city_centers": n_area_code_assigned,
        "dropped_invalid_coords_final": n_dropped_invalid_coords_final,
        "matched_t1": n_t1,
        "matched_t2": n_t2,
        "matched_t3": n_t3,
        "tbd_rows": n_tbd,
        "coords_from_kingpin_latlong": n_coords_from_latlong,
        "coords_from_kingpin_latlong_nozip_unique": n_coords_from_latlong_nozip,
        "coords_from_kingpin_latlong_city_unique": n_coords_from_latlong_city,
        "coords_from_kingpin_latlong_retailer_state_unique": n_coords_from_latlong_retailer_state,
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
        "area_code_centers_file": args.area_code_centers,
        "area_code_centers_loaded": len(area_centers),
    }

    with open(os.path.join(args.out_dir, "kingpin_build_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print("✅ kingpin.geojson build complete")
    print(json.dumps(stats, indent=2))

    if stats["coords_from_kingpin_latlong"] > 0:
        print(
            f"\n🔎 Sanity: coords_from_kingpin_latlong={stats['coords_from_kingpin_latlong']} "
            f"→ output_features={stats['output_features']}\n"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
