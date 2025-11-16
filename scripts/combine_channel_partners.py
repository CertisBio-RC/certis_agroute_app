import pandas as pd
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================
DATA_DIR = Path("data")          # Folder that contains the Excel files
SOURCE_FILE = DATA_DIR / "retailers_BREAKOUT.xlsx"
OUTPUT_FILE = DATA_DIR / "retailers.xlsx"

# ============================================================
# LOAD BREAKOUT WORKBOOK
# ============================================================
if not SOURCE_FILE.exists():
    raise FileNotFoundError(f"❌ Input file not found: {SOURCE_FILE}")

print("🔍 Scanning worksheets…")
excel = pd.ExcelFile(SOURCE_FILE)
sheet_names = excel.sheet_names
print(f"📄 Found {len(sheet_names)} sheets:")
for name in sheet_names:
    print(f"   • {name}")

# ============================================================
# NORMALIZE HEADERS
# ============================================================
def normalize_headers(columns):
    """Convert messy variations to a uniform schema."""
    mapping = {
        "long name": "Long Name",
        "retailer": "Retailer",
        "name": "Name",
        "address": "Address",
        "city": "City",
        "state": "State",
        "zip": "Zip",
        "category": "Category",
        "suppliers": "Suppliers",       # <-- your renamed column
        "supplier(s)": "Suppliers",     # legacy compatibility
    }
    out = []
    for col in columns:
        key = col.strip().lower()
        out.append(mapping.get(key, col.strip()))
    return out

# ============================================================
# INGEST & APPEND ALL TABS
# ============================================================
dfs = []
for sheet in sheet_names:
    print(f"📌 Reading sheet: {sheet}")
    df = pd.read_excel(SOURCE_FILE, sheet_name=sheet, dtype=str)

    df.columns = normalize_headers(df.columns)
    dfs.append(df)

combined = pd.concat(dfs, ignore_index=True)

# Drop fully empty rows
combined.dropna(how="all", inplace=True)

# Trim whitespace
combined = combined.applymap(
    lambda x: x.strip() if isinstance(x, str) else x
)

# ============================================================
# SAVE OUTPUT
# ============================================================
combined.to_excel(OUTPUT_FILE, index=False)
print("\n✅ retailers.xlsx successfully created:")
print(f"   → {OUTPUT_FILE}")
print(f"   Rows: {len(combined)}")
