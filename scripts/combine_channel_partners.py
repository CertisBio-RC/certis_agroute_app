import os
import re
import sys
import pandas as pd

# =============================================================================
# CERTIS AGROUTE DATABASE
# COMBINE retailers_BREAKOUT.xlsx → retailers.xlsx (canonical combined workbook)
#
# Fixes:
# - Header normalization (trim, collapse spaces)
# - Header alias mapping (Category vs "Category ", LongName vs "Long Name", etc.)
# - Guaranteed output columns (no silent dropping)
# - Hard-stop validation: Landus rows must have non-blank Category
# =============================================================================

INPUT_FILE = os.path.join("data", "retailers_BREAKOUT.xlsx")
OUTPUT_FILE = os.path.join("data", "retailers.xlsx")

# Canonical output schema (keep stable)
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
]

# Common header aliases -> canonical name (case/space-insensitive after normalization)
ALIASES = {
    # Long name variants
    "longname": "LongName",
    "long name": "LongName",
    "long_name": "LongName",
    "long-name": "LongName",
    "long name ": "LongName",

    # Retailer variants
    "retailer": "Retailer",
    "retailer name": "Retailer",

    # Location name variants
    "name": "Name",
    "location": "Name",
    "site": "Name",

    # Address variants
    "address": "Address",
    "street": "Address",
    "street address": "Address",
    "addr": "Address",

    # City / State / Zip variants
    "city": "City",
    "town": "City",
    "state": "State",
    "st": "State",
    "zip": "Zip",
    "zipcode": "Zip",
    "zip code": "Zip",
    "postal": "Zip",
    "postal code": "Zip",

    # Category variants (this is the key fix)
    "category": "Category",
    "category ": "Category",
    "categories": "Category",
    "cat": "Category",
    "account category": "Category",
    "acct category": "Category",
    "division/category": "Category",

    # Suppliers variants
    "suppliers": "Suppliers",
    "supplier": "Suppliers",
    "supplier(s)": "Suppliers",
    "vendors": "Suppliers",
}


def norm_header(h: str) -> str:
    """Normalize a header to a stable, comparable key."""
    if h is None:
        return ""
    s = str(h)
    s = s.replace("\ufeff", "")  # BOM if present
    s = s.strip()
    # collapse multiple whitespace into single spaces
    s = re.sub(r"\s+", " ", s)
    return s


def alias_key(h: str) -> str:
    """Normalization for alias lookup (lowercase)."""
    return norm_header(h).lower()


def canonicalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename columns to canonical names using ALIASES and normalization."""
    # Build rename map using alias matching
    rename_map = {}
    for col in df.columns:
        k = alias_key(col)
        if k in ALIASES:
            rename_map[col] = ALIASES[k]
        else:
            # Keep normalized original if it's already canonical (case-insensitive)
            # e.g., "Category" stays "Category" even if weird casing/spaces
            if k in [c.lower() for c in CANON_COLS]:
                # Map to exact canonical capitalization
                canon = next(c for c in CANON_COLS if c.lower() == k)
                rename_map[col] = canon
            else:
                # Leave as-is (normalized) for now
                rename_map[col] = norm_header(col)

    df = df.rename(columns=rename_map)

    # If there are duplicate columns after renaming, keep the first non-null per row
    # Example: both "Category" and "Categories" existed -> both become "Category"
    if df.columns.duplicated().any():
        dedup = {}
        for c in df.columns:
            if c not in dedup:
                dedup[c] = df[c]
            else:
                # combine: fill nulls in existing with values from duplicate
                dedup[c] = dedup[c].where(~dedup[c].isna(), df[c])
        df = pd.DataFrame(dedup)

    return df


def coerce_strings(df: pd.DataFrame) -> pd.DataFrame:
    """Trim string fields; keep NaN as NaN (don’t turn into 'nan' text)."""
    for c in CANON_COLS:
        if c in df.columns:
            # Only operate on object dtype columns
            if df[c].dtype == "object":
                df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)
    return df


def ensure_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure canonical columns exist; add missing as NA; reorder."""
    for c in CANON_COLS:
        if c not in df.columns:
            df[c] = pd.NA
    df = df[CANON_COLS].copy()
    return df


def is_blank_category(v) -> bool:
    """Treat '', None/NA, and textual nan/null/none as blank."""
    if v is None:
        return True
    try:
        if pd.isna(v):
            return True
    except Exception:
        pass
    s = str(v).strip()
    if s == "":
        return True

    # ✅ FIX: inline (?i) must be at the start OR use flags=
    if re.match(r"^(nan|null|none)$", s, flags=re.IGNORECASE):
        return True

    return False


def validate_landus(combined: pd.DataFrame) -> None:
    """Hard fail if Landus rows exist but Category is blank."""
    if "Retailer" not in combined.columns or "Category" not in combined.columns:
        raise RuntimeError("Validation failed: missing Retailer/Category columns in combined output.")

    landus = combined[combined["Retailer"].astype(str).str.contains("Landus", na=False)]
    landus_rows = len(landus)

    if landus_rows == 0:
        print("[WARN] No Landus rows found in combined workbook. (This may be OK, but double-check input.)")
        return

    blank_count = int(landus["Category"].apply(is_blank_category).sum())

    print(f"[CHECK] Landus rows in combined: {landus_rows}")
    print(f"[CHECK] Landus rows with blank/NaN Category: {blank_count}")

    if blank_count > 0:
        # Print a few examples to help debugging
        sample = landus[landus["Category"].apply(is_blank_category)][["Retailer", "Name", "City", "State", "Category"]].head(10)
        print("\n[ERROR] Sample Landus rows with blank Category (first 10):")
        print(sample.to_string(index=False))
        raise RuntimeError(
            f"Landus Category is still blank for {blank_count}/{landus_rows} rows after combine. "
            f"STOPPING to prevent bad pipeline output."
        )


def combine_workbook(input_file: str = INPUT_FILE, output_file: str = OUTPUT_FILE) -> None:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Missing file: {input_file}")

    excel = pd.ExcelFile(input_file)
    frames = []

    for sheet in excel.sheet_names:
        df = excel.parse(sheet)

        # Normalize + map headers to canonical names
        df = canonicalize_columns(df)
        df = coerce_strings(df)

        # Keep only canonical schema (but never silently drop; we add missing)
        df = ensure_schema(df)

        # Optional: carry a sheet indicator for debugging (comment out if you don't want it)
        # df["SourceSheet"] = sheet

        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)

    # Final trim on key string columns (safe)
    combined = coerce_strings(combined)

    # Hard-stop validation (prevents silent Landus breaks)
    validate_landus(combined)

    # Write output
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    combined.to_excel(output_file, index=False)
    print(f"[OK] Combined workbook saved → {output_file}")


if __name__ == "__main__":
    try:
        combine_workbook()
    except Exception as e:
        print(f"[FAIL] {e}")
        sys.exit(1)
