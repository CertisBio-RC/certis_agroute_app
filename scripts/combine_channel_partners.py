import pandas as pd
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================
DATA_DIR = Path("data")
SOURCE_FILE = DATA_DIR / "retailers_BREAKOUT.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.xlsx"

# ============================================================
# LOAD BREAKOUT WORKBOOK
# ============================================================
excel = pd.ExcelFile(SOURCE_FILE)
sheet_names = excel.sheet_names

print("🔍 Found worksheets:")
for s in sheet_names:
    print(" •", s)

def normalize_headers(cols):
    mapping = {
        "long name": "Long Name",
        "retailer": "Retailer",
        "name": "Name",
        "address": "Address",
        "city": "City",
        "state": "State",
        "zip": "Zip",
        "category": "Category",
        "suppliers": "Suppliers",
        "supplier(s)": "Suppliers",
    }
    out = []
    for c in cols:
        key = str(c).strip().lower()
        out.append(mapping.get(key, str(c).strip()))
    return out

dfs = []
for sheet in sheet_names:
    df = pd.read_excel(SOURCE_FILE, sheet_name=sheet, dtype=str)
    df.columns = normalize_headers(df.columns)
    dfs.append(df)

combined = pd.concat(dfs, ignore_index=True)
combined.dropna(how="all", inplace=True)
combined = combined.map(lambda x: x.strip() if isinstance(x, str) else x)

combined.to_excel(OUTPUT_FILE, index=False)
print(f"✅ Wrote retailers.xlsx with {len(combined)} rows")
