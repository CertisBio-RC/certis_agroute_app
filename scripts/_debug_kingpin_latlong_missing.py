import pandas as pd
from pathlib import Path

root = Path(__file__).resolve().parent.parent  # scripts/ -> repo root
xl = root / "data" / "kingpin_latlong.xlsx"

df = pd.read_excel(xl, dtype=str).fillna("")
df.columns = [str(c).strip() for c in df.columns]

required = ["RETAILER","CONTACT NAME","ADDRESS","CITY","STATE.1","ZIP CODE"]
if "STATE.1" not in df.columns and "STATE" in df.columns:
    df["STATE.1"] = df["STATE"]

def has_coords(r):
    return str(r.get("LAT","")).strip() != "" and str(r.get("LON","")).strip() != ""

def missing_any_required(r):
    missing = []
    for c in required:
        if c not in df.columns or str(r.get(c,"")).strip() == "":
            missing.append(c)
    return missing

rows = []
for i, r in df.iterrows():
    if has_coords(r):
        miss = missing_any_required(r)
        if miss:
            rows.append((i, r.get("RETAILER",""), r.get("CONTACT NAME",""), r.get("FULL BLOCK ADDRESS",""), miss))

print("Rows with coords but missing required fields:", len(rows))
for i, retailer, name, addr, miss in rows[:30]:
    print(f"- row {i}: {retailer} | {name} | {addr} | missing={miss}")
