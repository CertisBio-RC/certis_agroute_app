import os, json, re, requests, urllib.parse
from pathlib import Path

root = Path(__file__).resolve().parent
data = root / "data"

def stripq(s): 
    s = (s or "").strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1].strip()
    return s

def load_txt(p):
    if not p.exists(): return ""
    raw = stripq(p.read_text(encoding="utf-8-sig").strip())
    if raw.startswith("{") and raw.endswith("}"):
        try:
            obj = json.loads(raw)
            for k in ("MAPBOX_ACCESS_TOKEN","MAPBOX_TOKEN","NEXT_PUBLIC_MAPBOX_TOKEN","token","access_token"):
                if k in obj and obj[k]:
                    return stripq(str(obj[k]))
        except Exception:
            pass
    raw = re.sub(r"^\s*(token|access_token|mapbox_token|mapbox_access_token|next_public_mapbox_token)\s*=\s*","",raw,flags=re.I).strip()
    return raw

def load_json(p):
    if not p.exists(): return ""
    try:
        obj = json.loads(p.read_text(encoding="utf-8-sig"))
        for k in ("MAPBOX_ACCESS_TOKEN","MAPBOX_TOKEN","NEXT_PUBLIC_MAPBOX_TOKEN","token","access_token"):
            if k in obj and obj[k]:
                return stripq(str(obj[k]))
    except Exception:
        return ""
    return ""

env_access = stripq(os.getenv("MAPBOX_ACCESS_TOKEN",""))
env_token  = stripq(os.getenv("MAPBOX_TOKEN",""))
env_next   = stripq(os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN",""))

txt = load_txt(data/"token.txt")
js  = load_json(data/"token.json")

print("ENV MAPBOX_ACCESS_TOKEN:", len(env_access), env_access[:3], env_access[-6:])
print("ENV MAPBOX_TOKEN       :", len(env_token),  env_token[:3],  env_token[-6:])
print("ENV NEXT_PUBLIC...     :", len(env_next),   env_next[:3],   env_next[-6:])
print("data/token.txt         :", len(txt),        txt[:3],        txt[-6:])
print("data/token.json        :", len(js),         js[:3],         js[-6:])

# emulate your script priority:
t = env_access or env_token or env_next or txt or js
print("\nCHOSEN TOKEN:", len(t), t[:3], t[-6:])

q = "507 Braddock Ave, Armour, SD 57313"
url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + urllib.parse.quote(q) + ".json"
r = requests.get(url, params={"access_token": t, "limit": 1}, timeout=20)
print("LIVE CALL HTTP", r.status_code)
print((r.text or "")[:160].replace("\n"," "))
