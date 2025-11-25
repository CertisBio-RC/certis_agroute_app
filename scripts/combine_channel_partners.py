import pandas as pd
import os

# ============================================================
# COMBINE retailers_BREAKOUT.xlsx → retailers.xlsx
# ============================================================

INPUT_FILE = os.path.join("data", "retailers_BREAKOUT.xlsx")
OUTPUT_FILE = os.path.join("data", "retailers.xlsx")

def combine_workbook():
    if not os.path.exists(INPUT_FILE):
        raise FileNotFoundError(f"Missing file: {INPUT_FILE}")

    excel = pd.ExcelFile(INPUT_FILE)
    frames = []

    for sheet in excel.sheet_names:
        df = excel.parse(sheet)

        # Keep ONLY the verified columns
        expected_cols = [
            "Long Name", "Retailer", "Name", "Address",
            "City", "State", "Zip", "Category", "Suppliers"
        ]

        present = [c for c in expected_cols if c in df.columns]

        df = df[present].copy()
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    combined.to_excel(OUTPUT_FILE, index=False)
    print(f"[OK] Combined workbook saved → {OUTPUT_FILE}")

if __name__ == "__main__":
    combine_workbook()
