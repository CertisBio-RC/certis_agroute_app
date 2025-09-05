// … inside your Map component, where you manage the Home marker …

function createHomeEl(label = "H"): HTMLElement {
  const el = document.createElement("div");
  el.className = "home-pin";
  el.style.width = "28px";
  el.style.height = "28px";
  el.style.borderRadius = "50%";
  el.style.background = "#16a34a";
  el.style.border = "2px solid white";
  el.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.2)";
  el.style.color = "white";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.font = "600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  // anchor fix: ensure bottom-center anchors the exact lng/lat pixel, no zoom snapping
  el.style.transform = "translate(-50%, -100%)";
  el.textContent = label;
  return el;
}

// When setting/updating:
const el = createHomeEl("H");
if (homeMarkerRef.current) {
  // set the element and position explicitly
  (homeMarkerRef.current as any).setElement?.(el);
  homeMarkerRef.current.setLngLat([home.lng, home.lat]);
} else {
  homeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
    .setLngLat([home.lng, home.lat])
    .addTo(mapRef.current!);
}
