# ========================================
# combine_channel_partners.py
# Certis AgRoute Planner – Phase B Data Integrity Lockdown
# ========================================
import pandas as pd
import re
from pathlib import Path

# ========================================
# CONFIGURATION
# ========================================
KEEP_POBOX = False  # Set True only if you need to keep them for audit
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SOURCE_FILE = DATA_DIR / "Channel Partners and Kingpins Map - BREAKOUT.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.xlsx"
REMOVED_FILE = DATA_DIR / "retailers_removed_pobox.xlsx"

EXPECTED_COLUMNS = [
    "Long Name", "Retailer", "Name", "Address", "City",
    "State", "Zip", "Category", "Suppliers", "Source Sheet"
]

POBOX_PATTERN = re.compile(
    r"\b(p[\.\s]*o[\.\s]*\s*box|^box\s*\d+|rural\s*route|rr\s*\d+|hc\s*\d+|general\s*delivery)\b",
    re.IGNORECASE
)

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
    normalized = []
    for col in columns:
        c = str(col).strip().lower()

        if c in ["supplier", "suppliers", "supplier(s)", "supplier list"]:
            normalized.append("Suppliers")
        elif c in ["zip code", "zipcode", "postal code"]:
            normalized.append("Zip")
        elif c in ["city/town", "town"]:
            normalized.append("City")
        elif c in ["state/province", "province"]:
            normalized.append("State")
        elif c in ["business name or region", "branch name"]:
            normalized.append("Name")
        elif c in ["retailer name", "retailer/coop", "retail name"]:
            normalized.append("Retailer")
        elif c in ["phone", "office phone", "cell phone", "telephone"]:
            normalized.append("Phone")
        else:
            normalized.append(col.strip().title())
    return normalized

# ========================================
# CATEGORY NORMALIZATION
# ========================================
def clean_category(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        return "Unknown"
    v = value.strip().lower()
    if "agronomy" in v or "ag" in v:
        return "Agronomy"
    if "feed" in v:
        return "Feed"
    if "grain" in v:
        return "Grain"
    if any(k in v for k in ["office", "hq", "head"]):
        return "Office"
    if any(k in v for k in ["kingpin", "main", "corporate"]):
        return "Kingpin"
    return "Unknown"

# ========================================
# COMBINE SHEETS
# ========================================
combined_frames = []
removed_rows = []

for sheet in sheet_names:
    try:
        df = pd.read_excel(SOURCE_FILE, sheet_name=sheet)
        df.columns = normalize_headers(df.columns)

        # Ensure required columns exist
        for col in EXPECTED_COLUMNS[:-1]:
            if col not in df.columns:
                df[col] = ""

        df["Source Sheet"] = sheet
        df = df.fillna("").applymap(lambda x: x.strip() if isinstance(x, str) else x)
        df["Category"] = df["Category"].apply(clean_category)

        # Drop rows without Name or Address
        df = df[(df["Name"] != "") | (df["Address"] != "")]

        # Remove PO Boxes / RR addresses if enabled
        if not KEEP_POBOX:
            mask = df["Address"].str.contains(POBOX_PATTERN, na=False)
            removed = df[mask]
            if not removed.empty:
                print(f"🚫 {len(removed)} P.O. Box / RR rows removed from '{sheet}'")
                removed_rows.append(removed)
            df = df[~mask]

        combined_frames.append(df[EXPECTED_COLUMNS])
        print(f"✅ Processed sheet: {sheet}  → {len(df)} rows retained")

    except Exception as e:
        print(f"⚠️ Skipping sheet '{sheet}': {e}")

# ========================================
# SAVE OUTPUTS
# ========================================
if not combined_frames:
    raise RuntimeError("❌ No valid sheets combined. Check source workbook structure.")

final_df = pd.concat(combined_frames, ignore_index=True).drop_duplicates()
final_df.sort_values(by=["State", "Retailer", "City", "Name"], inplace=True)
final_df.reset_index(drop=True, inplace=True)

final_df.to_excel(OUTPUT_FILE, index=False)
print(f"\n✅ Combined {len(sheet_names)} sheets into: {OUTPUT_FILE}")
print(f"✅ Final row count: {len(final_df)}")

if removed_rows:
    removed_df = pd.concat(removed_rows, ignore_index=True)
    removed_df.to_excel(REMOVED_FILE, index=False)
    pct_removed = round(len(removed_df) / (len(final_df) + len(removed_df)) * 100, 2)
    print(f"🗑️  Removed {len(removed_df)} invalid rows ({pct_removed}% of total). Logged in {REMOVED_FILE}")

print("✅ Supplier data retained, categories normalized, P.O. Boxes scrubbed.")
