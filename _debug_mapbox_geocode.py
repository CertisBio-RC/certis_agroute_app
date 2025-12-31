import os, requests, urllib.parse
t = os.getenv("MAPBOX_TOKEN","")
q = "507 Braddock Ave, Armour, SD 57313"
url = "https://api.mapbox.com/geocoding/v5/mapbox.places/" + urllib.parse.quote(q) + ".json"
r = requests.get(url, params={"access_token": t, "limit": 1}, timeout=20)
print("HTTP", r.status_code)
print((r.text or "")[:220].replace("\n"," "))
