# ========================================
# combine_channel_partners.py
# Certis AgRoute Planner – Phase A Data Integrity (Suppliers kept)
# ========================================
import pandas as pd
from pathlib import Path

# ========================================
# CONFIGURATION
# ========================================
# Use absolute path so it works from any directory
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SOURCE_FILE = DATA_DIR / "Channel Partners and Kingpins Map - BREAKOUT.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.xlsx"

EXPECTED_COLUMNS = [
    "Long Name", "Retailer", "Name", "Address", "City",
    "State", "Zip", "Category", "Suppliers", "Source Sheet"
]

# ========================================
# LOAD WORKBOOK
# ========================================
if not SOURCE_FILE.exists():
    raise FileNotFoundError(f"❌ Input file not found: {SOURCE_FILE}")

print("🔍 Scanning workbook...")
excel = pd.ExcelFile(SOURCE_FILE)
sheet_names = excel.sheet_names
print(f"✅ Found {len(sheet_names)} sheets: {sheet_names}")

# ========================================
# HEADER NORMALIZATION
# ========================================
def normalize_headers(columns):
    """Standardize column names to consistent schema."""
    normalized = []
    for col in columns:
        c = str(col).strip().lower()

        if c in ["supplier", "suppliers", "supplier(s)", "supplier list"]:
            normalized.append("Suppliers")
        elif c in ["zip code", "zipcode", "postal code"]:
            normalized.append("Zip")
        elif c in ["city/town", "town"]:
            normalized.append("City")
        elif c in ["state/province"]:
            normalized.append("State")
        elif c in ["business name or region", "branch name"]:
            normalized.append("Name")
        elif c in ["phone", "office phone", "cell phone", "telephone"]:
            normalized.append("Phone")
        else:
            normalized.append(col.strip().title())
    return normalized


# ========================================
# CATEGORY NORMALIZATION
# ========================================
def clean_category(value: str) -> str:
    """Unify Category field values across all sheets."""
    if not isinstance(value, str) or not value.strip():
        return "Unknown"

    v = value.strip().lower()

    if "agronomy" in v or "ag" in v:
        return "Agronomy"
    if "feed" in v:
        return "Feed"
    if "grain" in v:
        return "Grain"
    if "office" in v or "hq" in v or "head" in v:
        return "Office"
    if "kingpin" in v or "main" in v or "corporate" in v:
        return "Kingpin"

    return "Unknown"


# ========================================
# COMBINE SHEETS
# ========================================
combined_frames = []

for sheet in sheet_names:
    try:
        df = pd.read_excel(SOURCE_FILE, sheet_name=sheet)
        df.columns = normalize_headers(df.columns)

        # Add missing required columns
        required = [
            "Long Name", "Retailer", "Name", "Address",
            "City", "State", "Zip", "Category", "Suppliers"
        ]
        for col in required:
            if col not in df.columns:
                df[col] = ""

        # Add source sheet tag
        df["Source Sheet"] = sheet

        # Trim whitespace and normalize Category
        df = df.fillna("").applymap(lambda x: x.strip() if isinstance(x, str) else x)
        df["Category"] = df["Category"].apply(clean_category)

        # Remove fully empty rows (no Name or Address)
        df = df[(df["Name"] != "") | (df["Address"] != "")]

        combined_frames.append(df[EXPECTED_COLUMNS])
        print(f"✅ Processed sheet: {sheet}  → {len(df)} rows")

    except Exception as e:
        print(f"⚠️ Skipping sheet '{sheet}': {e}")

# ========================================
# SAVE COMBINED OUTPUT
# ========================================
if not combined_frames:
    raise RuntimeError("❌ No valid sheets combined. Check source workbook structure.")

final_df = pd.concat(combined_frames, ignore_index=True)
final_df.drop_duplicates(inplace=True)
final_df.reset_index(drop=True, inplace=True)

# Sort by State then Retailer for cleaner inspection
final_df.sort_values(by=["State", "Retailer", "City", "Name"], inplace=True)

final_df.to_excel(OUTPUT_FILE, index=False)
print(f"\n✅ Combined {len(sheet_names)} sheets into: {OUTPUT_FILE}")
print(f"✅ Final row count: {len(final_df)}")
print("✅ Supplier data retained and Category normalized.")
