# ========================================
# combine_channel_partners.py
# Certis AgRoute Planner — Phase A: Sheet Merger
# ========================================
# Combines all worksheets from retailers_BREAKOUT.xlsx into a unified retailers.xlsx
# ========================================

import pandas as pd
from pathlib import Path

# ========================================
# CONFIGURATION
# ========================================
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SOURCE_FILE = DATA_DIR / "retailers_BREAKOUT.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.xlsx"

# ========================================
# VALIDATION
# ========================================
if not SOURCE_FILE.exists():
    raise FileNotFoundError(f"❌ Input file not found: {SOURCE_FILE}")

print(f"📘 Reading workbook: {SOURCE_FILE}")
excel = pd.ExcelFile(SOURCE_FILE)
print(f"✅ Found {len(excel.sheet_names)} worksheets: {excel.sheet_names}")

# ========================================
# NORMALIZE HEADERS
# ========================================
def normalize_headers(columns):
    """Standardize column names across inconsistent sheets."""
    normalized = []
    for col in columns:
        c = str(col).strip()
        c = c.replace("\n", " ").replace("\r", " ")
        c = c.replace("Suppliers(s)", "Suppliers")
        c = c.replace("Supplier(s)", "Suppliers")
        c = c.replace("Business Name or Region", "Long Name")
        c = c.replace("Long Name", "Long Name")  # remove nonbreaking spaces
        normalized.append(c)
    return normalized

# ========================================
# COMBINE SHEETS
# ========================================
combined = []
for sheet_name in excel.sheet_names:
    print(f"🧩 Processing sheet: {sheet_name}")
    df = pd.read_excel(SOURCE_FILE, sheet_name=sheet_name)
    df.columns = normalize_headers(df.columns)
    df["Source Sheet"] = sheet_name
    combined.append(df)

df_all = pd.concat(combined, ignore_index=True)

# ========================================
# COLUMN ALIGNMENT
# ========================================
expected_cols = [
    "Long Name", "Retailer", "Name", "Address", "City",
    "State", "Zip", "Category", "Suppliers"
]

for col in expected_cols:
    if col not in df_all.columns:
        df_all[col] = ""

df_all = df_all[expected_cols + ["Source Sheet"]]

# ========================================
# CLEANUP
# ========================================
df_all = df_all.dropna(how="all")
df_all = df_all.fillna("")
print(f"✅ Combined {len(df_all)} total rows from all sheets")

# ========================================
# SAVE OUTPUT
# ========================================
df_all.to_excel(OUTPUT_FILE, index=False)
print(f"💾 Saved merged dataset → {OUTPUT_FILE}")
print("🏁 Phase A complete — master retailer list ready for geocoding.")
