'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import mapboxgl, { Map as MBMap, LngLatLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export type Basemap = 'Hybrid' | 'Streets';

type GJFC = GeoJSON.FeatureCollection<GeoJSON.Point, any>;

export type CertisMapProps = {
  token: string;
  basemap: Basemap;
  data: GJFC;
  /** [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
  /** Optional route line (one or more segments) */
  route?: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  /** Double-click anywhere on the map to set Home */
  onMapDblClick?: (lnglat: [number, number]) => void;
  /** Click a point to add as a stop */
  onPointClick?: (lnglat: [number, number], title: string) => void;
};

const styleFor = (basemap: Basemap) =>
  basemap === 'Hybrid'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/streets-v12';

function popupHTML(p: any, basePath: string) {
  const title = [p.Retailer, p.Name].filter(Boolean).join(' — ') || p.title || 'Location';
  const lines: string[] = [];
  if (p.Category) lines.push(`<div class="k-meta">${p.Category}</div>`);
  const adr = [p.Address, p.City, p.State, p.Zip].filter(Boolean).join(', ');
  if (adr) lines.push(`<div>${adr}</div>`);
  let logo = '';
  const logoProp = p.logo || p.Logo || p.logo_url || p.logoUrl;
  if (logoProp) {
    const src = String(logoProp).startsWith('http')
      ? logoProp
      : `${basePath}/logos/${logoProp}`;
    logo = `<img class="k-logo" src="${src}" alt="" />`;
  }
  return `
    <div class="k-pop">
      ${logo}
      <div class="k-title">${title}</div>
      ${lines.join('')}
    </div>
  `;
}

function asLngLat(coord: any): [number, number] {
  // GeoJSON order is [lng, lat]
  if (Array.isArray(coord) && coord.length >= 2) return [coord[0], coord[1]];
  return [0, 0];
}

export default function CertisMap({
  token,
  basemap,
  data,
  bbox,
  route,
  onMapDblClick,
  onPointClick,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MBMap | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Compute a stable basePath from <base> or location pathname (works on GH Pages subpath)
  const basePath = useMemo(() => {
    const el = document.querySelector('base') as HTMLBaseElement | null;
    if (el?.href) {
      try {
        const u = new URL(el.href);
        return u.pathname.replace(/\/$/, '');
      } catch {}
    }
    const parts = location.pathname.split('/').filter(Boolean);
    // e.g. /certis_agroute_app/ -> /certis_agroute_app
    return parts.length ? `/${parts[0]}` : '';
  }, []);

  // build (or rebuild) the map when the style changes
  useEffect(() => {
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current as HTMLDivElement,
      style: styleFor(basemap),
      center: [-97.5, 41.5],
      zoom: 3.2,
      attributionControl: false,
      projection: 'mercator',
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

    const setupSourcesAndLayers = () => {
      if (!map.getSource('retailers')) {
        map.addSource('retailers', {
          type: 'geojson',
          data,
          cluster: true,
          clusterMaxZoom: 9,
          clusterRadius: 42,
        });
      } else {
        (map.getSource('retailers') as mapboxgl.GeoJSONSource).setData(data);
      }

      // cluster circles
      if (!map.getLayer('clusters')) {
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'retailers',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#3B82F6',
            'circle-opacity': 0.85,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              20,
              25, 26,
              75, 34,
              150, 42,
              350, 50,
            ],
            'circle-stroke-color': '#0b1220',
            'circle-stroke-width': 2,
          },
        });
      }

      // cluster count label
      if (!map.getLayer('cluster-count')) {
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'retailers',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count'],
            'text-size': 12,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': '#ffffff',
          },
        });
      }

      // Unclustered non-kingpins
      if (!map.getLayer('unclustered-dots')) {
        map.addLayer({
          id: 'unclustered-dots',
          type: 'circle',
          source: 'retailers',
          filter: [
            'all',
            ['!', ['has', 'point_count']],
            ['!', ['any',
              ['==', ['get', 'Category'], 'Kingpin'],
              ['==', ['get', 'Type'], 'Kingpin'],
            ]],
          ],
          paint: {
            'circle-color': [
              'match',
              ['get', 'Category'],
              'Agronomy', '#60A5FA',
              'Distribution', '#34D399',
              'Grain', '#FBBF24',
              'Office/Service', '#A78BFA',
              /* default */ '#93C5FD',
            ],
            'circle-opacity': 0.9,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 6, 12, 8],
            'circle-stroke-color': '#0b1220',
            'circle-stroke-width': 2,
          },
        });
      }

      // Kingpins emphasized (red fill + yellow stroke, always above)
      if (!map.getLayer('kingpin-circles')) {
        map.addLayer({
          id: 'kingpin-circles',
          type: 'circle',
          source: 'retailers',
          filter: ['all', ['!', ['has', 'point_count']], ['any',
            ['==', ['get', 'Category'], 'Kingpin'],
            ['==', ['get', 'Type'], 'Kingpin'],
          ]],
          paint: {
            'circle-color': '#FF2D55',       // bright red
            'circle-opacity': 0.95,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 10, 12, 14],
            'circle-stroke-color': '#FFD60A', // yellow border
            'circle-stroke-width': 3,
          },
        });
      }

      // Route line (optional)
      if (route && !map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: route });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#22c55e',
            'line-width': 4,
            'line-opacity': 0.8,
          },
        });
      } else if (route && map.getSource('route')) {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData(route);
      } else if (!route && map.getSource('route')) {
        map.removeLayer('route-line');
        map.removeSource('route');
      }
    };

    map.on('load', () => {
      setupSourcesAndLayers();

      // fit bbox once on load
      if (bbox) {
        map.fitBounds(bbox as any, { padding: 28, duration: 0 });
      }
    });

    // hover/touch popup
    const hoverTargets = ['kingpin-circles', 'unclustered-dots'];
    const ensurePopup = () => {
      if (!popupRef.current) {
        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnMove: true,
          offset: 12,
        });
      }
      return popupRef.current!;
    };

    const onMove = (e: any) => {
      const f = map.queryRenderedFeatures(e.point, { layers: hoverTargets })[0];
      if (!f) {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) popupRef.current.remove();
        return;
      }
      map.getCanvas().style.cursor = 'pointer';
      const p = f.properties || {};
      const html = popupHTML(p, basePath);
      ensurePopup().setLngLat(e.lngLat).setHTML(html).addTo(map);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      if (popupRef.current) popupRef.current.remove();
    };

    map.on('mousemove', onMove);
    map.on('mouseleave', 'unclustered-dots', onLeave);
    map.on('mouseleave', 'kingpin-circles', onLeave);

    // tap-to-open popup (mobile)
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: hoverTargets })[0];
      if (!f) return;
      const p = f.properties || {};
      const html = popupHTML(p, basePath);
      ensurePopup().setLngLat(e.lngLat).setHTML(html).addTo(map);

      // click adds a stop
      const title = [p.Retailer, p.Name].filter(Boolean).join(' — ') || p.title || 'Stop';
      const ll = asLngLat((f.geometry as any).coordinates);
      onPointClick?.(ll, title);
    });

    // dblclick sets home
    map.on('dblclick', (e) => {
      onMapDblClick?.([e.lngLat.lng, e.lngLat.lat]);
    });

    // If style changes (basemap toggle), rebuild layers
    map.on('styledata', () => {
      if (!map.isStyleLoaded()) return;
      // sources/layers might have been wiped by setStyle; ensure they exist
      if (!map.getSource('retailers')) {
        setupSourcesAndLayers();
      }
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [token, basemap, basePath]); // rebuild on basemap change

  // update data / route / bbox without a full rebuild
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('retailers') as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(data);

    if (bbox) {
      // stay roughly in place if current view already intersects bbox; otherwise fit
      const b = bbox as any;
      map.fitBounds(b, { padding: 28, duration: 0 });
    }

    if (route) {
      if (!map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: route });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 0.8 },
        });
      } else {
        (map.getSource('route') as mapboxgl.GeoJSONSource).setData(route);
      }
    } else if (map.getSource('route')) {
      map.removeLayer('route-line');
      map.removeSource('route');
    }
  }, [data, bbox, route]);

  return <div ref={containerRef} className="map-card" />;
}
