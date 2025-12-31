import os
t = os.getenv("MAPBOX_TOKEN","")
print("len=", len(t))
print("head=", t[:3])
print("tail=", t[-10:])
print("has_space=", " " in t)
print("has_quote=", ('"' in t) or ("'" in t))
