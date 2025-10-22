# scripts/combine_channel_partners.py
import pandas as pd
from pathlib import Path

# ========================================
# CONFIGURATION
# ========================================
DATA_DIR = Path("data")
SOURCE_FILE = DATA_DIR / "Channel Partners and Kingpins Map - BREAKOUT.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.xlsx"

# ========================================
# LOAD WORKBOOK
# ========================================
if not SOURCE_FILE.exists():
    raise FileNotFoundError(f"Input file not found: {SOURCE_FILE}")

print("🔍 Scanning sheets...")
excel = pd.ExcelFile(SOURCE_FILE)
sheet_names = excel.sheet_names
print(f"✅ Found {len(sheet_names)} sheets: {sheet_names}")

# ========================================
# NORMALIZE HEADERS
# ========================================
def normalize_headers(columns):
    """Standardize column names to ensure consistency."""
    normalized = []
    for col in columns:
        c = str(col).strip().lower()
        # handle supplier variants
        if c in ["supplier", "suppliers", "supplier(s)", "supplier list"]:
            normalized.append("Suppliers")
        elif c in ["zip code", "zipcode", "postal code"]:
            normalized.append("Zip")
        elif c in ["city/town", "town"]:
            normalized.append("City")
        elif c == "state/province":
            normalized.append("State")
        elif c in ["business name or region", "branch name"]:
            normalized.append("Name")
        elif c in ["phone", "office phone", "cell phone"]:
            normalized.append("Phone")
        else:
            normalized.append(col.strip())
    return normalized

# ========================================
# COMBINE SHEETS
# ========================================
combined = []
for sheet in sheet_names:
    try:
        df = pd.read_excel(SOURCE_FILE, sheet_name=sheet)
        df.columns = normalize_headers(df.columns)

        # Add missing expected columns
        expected = [
            "Long Name", "Retailer", "Name", "Address", "City",
            "State", "Zip", "Category", "Suppliers"
        ]
        for col in expected:
            if col not in df.columns:
                df[col] = ""

        # Tag origin sheet
        df["Source Sheet"] = sheet

        combined.append(df[expected + ["Source Sheet"]])
    except Exception as e:
        print(f"⚠️ Skipping sheet {sheet}: {e}")

# ========================================
# SAVE COMBINED FILE
# ========================================
if not combined:
    raise RuntimeError("No sheets were combined. Check source file headers.")

final_df = pd.concat(combined, ignore_index=True)
final_df.to_excel(OUTPUT_FILE, index=False)
print(f"✅ Combined {len(sheet_names)} sheets into {OUTPUT_FILE}")
print(f"✅ Total rows: {len(final_df)}")
