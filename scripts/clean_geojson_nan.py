#!/usr/bin/env python3
"""
CERTIS AGROUTE — Clean GeoJSON NaN Values

Problem:
  Some pipeline steps (pandas -> json) leave literal NaN values in
  the GeoJSON properties, e.g.:

      "Suppliers": NaN
      "Category": NaN
      "LongName": NaN
      coordinates: [NaN, NaN]

  This is NOT valid JSON and causes browser errors like:

      Unexpected token 'N' ... "ppliers": NaN ...

Solution:
  This utility:
    • Loads the GeoJSON (Python's json module happily parses NaN)
    • Recursively walks the object and replaces any float('nan') with ""
      (empty string; change to None if you prefer JSON null)
    • Writes the cleaned file back out with allow_nan=False so any remaining
      NaN would raise an error instead of sneaking through again.

Usage (from project root):
  python scripts/clean_geojson_nan.py public/data/retailers.geojson
  python scripts/clean_geojson_nan.py public/data/kingpin.geojson
"""

from __future__ import annotations

import argparse
import json
import math
import os
from typing import Any, List


def _clean_nans(obj: Any) -> Any:
    """
    Recursively replace float('nan') with "".

    If you ever decide you'd rather use JSON null, change the return value
    in the float/NaN branch to None instead of "".
    """
    # Primitive float NaN
    if isinstance(obj, float) and math.isnan(obj):
        return ""

    # Dict -> walk values
    if isinstance(obj, dict):
        return {k: _clean_nans(v) for k, v in obj.items()}

    # List / tuple
    if isinstance(obj, list):
        return [_clean_nans(v) for v in obj]

    if isinstance(obj, tuple):
        return tuple(_clean_nans(v) for v in obj)

    # Everything else passes through unchanged
    return obj


def clean_file(path: str) -> None:
    if not os.path.exists(path):
        print(f"❌ File not found: {path}")
        return

    print(f"🧼 Cleaning NaN values in: {path}")

    # Load with default settings (Python json accepts NaN / Infinity / -Infinity)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cleaned = _clean_nans(data)

    # Overwrite the file with NaN disallowed (any missed NaN will raise)
    tmp_path = path + ".tmp"

    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2, allow_nan=False)

    # Atomic-ish replace
    os.replace(tmp_path, path)

    print(f"✅ Cleaned and saved: {path}")


def main(argv: List[str] | None = None) -> int:
    import sys

    ap = argparse.ArgumentParser(
        description="Clean NaN values out of one or more GeoJSON files."
    )
    ap.add_argument(
        "paths",
        nargs="+",
        help="GeoJSON file(s) to clean (e.g., public/data/retailers.geojson).",
    )
    args = ap.parse_args(argv)

    for p in args.paths:
        clean_file(p)

    print("🎉 Done cleaning GeoJSON NaN values.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
