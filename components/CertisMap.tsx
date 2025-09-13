'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Feature, Geometry, Point } from 'geojson';
import mapboxgl from 'mapbox-gl';

// -----------------------------
// Public types (wider to accept both cases)
// -----------------------------
export type Basemap = 'Hybrid' | 'Streets' | 'hybrid' | 'streets';
export type MarkerStyle = 'Colored dots' | 'Logos' | 'dots' | 'logos';

export type Stop = {
  title: string;
  coords: [number, number]; // [lng, lat]
};

type Props = {
  /** e.g. "/certis_agroute_app" on Pages; "" locally */
  basePath?: string;
  /** Mapbox public token; if omitted we fall back to a raster basemap */
  token?: string;

  /** "Hybrid" | "Streets" (also accepts lowercase) */
  basemap: Basemap;
  /** "Colored dots" | "Logos" (also accepts short lowercase) */
  markerStyle: MarkerStyle;

  /** If provided, the map will fetch features from this url */
  dataUrl?: string;
  /** Or inline FeatureCollection instead of dataUrl */
  data?: FeatureCollection<Geometry>;

  /** Optional viewport fit on mount */
  bbox?: [number, number, number, number];

  /** Optional home marker (lng,lat) */
  home?: [number, number] | null;

  /** Optional planned stops to render (and connect) */
  stops?: Stop[];

  /** Optional pre-built route line */
  routeGeoJSON?: FeatureCollection<Geometry>;

  /** Double-click on map callback (lnglat) */
  onMapDblClick?: (lnglat: [number, number]) => void;
  /** Click on a retailer point callback (lnglat, title) */
  onPointClick?: (lnglat: [number, number], title: string) => void;

  /** Whether globe projection is desired */
  globe?: boolean;
};

// -----------------------------
// Helpers
// -----------------------------
const styleForBasemap = (name: Basemap, tokenPresent: boolean) => {
  const norm = typeof name === 'string' ? name.toLowerCase() : 'hybrid';
  if (!tokenPresent) {
    // Raster fallback – OSM/Carto hybrid-ish
    return {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution:
            '© OpenStreetMap contributors',
        },
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 },
      ],
    } as any;
  }

  // Mapbox styles
  if (norm === 'hybrid') return 'mapbox://styles/mapbox/satellite-streets-v12';
  return 'mapbox://styles/mapbox/streets-v12';
};

const normalizeBasemap = (b: Basemap): 'Hybrid' | 'Streets' =>
  (String(b).toLowerCase() === 'hybrid' ? 'Hybrid' : 'Streets');

const normalizeMarkerStyle = (m: MarkerStyle): 'Colored dots' | 'Logos' => {
  const s = String(m).toLowerCase();
  if (s === 'logos' || s === 'logo') return 'Logos';
  return 'Colored dots';
};

const kingpinFilterExpr: any = ['==', ['get', 'Category'], 'Kingpin'];

// Palette per Category
const categoryColor = (cat?: string) => {
  switch ((cat || '').toLowerCase()) {
    case 'kingpin':
      return '#ff3b3b';
    case 'agronomy':
      return '#22c55e';
    case 'seed':
      return '#f59e0b';
    case 'office/service':
    case 'office':
    case 'service':
      return '#60a5fa';
    default:
      return '#93c5fd';
  }
};

function featuresByRetailer(fc?: FeatureCollection<Geometry>) {
  const names = new Set<string>();
  if (!fc) return names;
  for (const f of fc.features) {
    const n = String((f.properties as any)?.Retailer || '').trim();
    if (n) names.add(n);
  }
  return names;
}

async function loadImageSafe(map: mapboxgl.Map, name: string, url: string) {
  if (map.hasImage(name)) return;
  return new Promise<void>((resolve) => {
    map.loadImage(url, (err, img) => {
      if (!err && img) {
        try {
          map.addImage(name, img, { pixelRatio: 2 });
        } catch (_) {
          /* no-op */
        }
      }
      resolve();
    });
  });
}

function ensurePoint(f: Feature<Geometry>): f is Feature<Point> {
  return f?.geometry?.type === 'Point';
}

// -----------------------------
// Component
// -----------------------------
const CertisMap: React.FC<Props> = ({
  basePath = '',
  token = '',
  basemap,
  markerStyle,
  dataUrl,
  data,
  bbox,
  home,
  stops,
  routeGeoJSON,
  onMapDblClick,
  onPointClick,
  globe = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [fc, setFc] = useState<FeatureCollection<Geometry> | undefined>(data);

  // normalize props
  const baseLabel = normalizeBasemap(basemap);
  const markerLabel = normalizeMarkerStyle(markerStyle);
  const wantsToken = !!token;

  // fetch data if url supplied
  useEffect(() => {
    let cancelled = false;
    if (!dataUrl) return;
    (async () => {
      try {
        const res = await fetch(dataUrl, { cache: 'no-store' });
        const json = (await res.json()) as FeatureCollection<Geometry>;
        if (!cancelled) setFc(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  // build or rebuild map on basemap/token change
  useEffect(() => {
    if (!containerRef.current) return;

    // dispose previous instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (wantsToken) mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleForBasemap(baseLabel, wantsToken),
      projection: globe ? 'globe' : 'mercator',
      center: [-97.5, 41.5],
      zoom: 4.5,
      cooperativeGestures: true,
      attributionControl: true,
      hash: true,
    });
    mapRef.current = map;

    // resize guard
    const rsz = () => map.resize();
    window.addEventListener('resize', rsz);

    map.on('load', async () => {
      // Fit bbox if requested
      if (bbox && bbox.length === 4) {
        try {
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
            padding: 40,
            duration: 0,
          });
        } catch {
          /* ignore */
        }
      }

      // Add sources/layers for points (with clustering for non-kingpins)
      if (fc) {
        map.addSource('retailers', {
          type: 'geojson',
          data: fc,
          cluster: true,
          clusterRadius: 55,
          clusterProperties: {}, // default
          promoteId: 'id',
          generateId: true,
        });

        // Highly-visible KINGPINS (never clustered)
        const kingpins: FeatureCollection<Point> = {
          type: 'FeatureCollection',
          features: fc.features
            .filter((f) => (f.properties as any)?.Category === 'Kingpin')
            .filter(ensurePoint) as Feature<Point>[],
        };
        map.addSource('kingpins', { type: 'geojson', data: kingpins });

        // Kingpin circles (always on top)
        map.addLayer({
          id: 'kingpin-circles',
          type: 'circle',
          source: 'kingpins',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 5,
              8, 10,
              12, 16,
              14, 20,
            ],
            'circle-color': '#ff3b3b',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#1b1b1b',
          },
        });

        // Optional kingpin label halo
        map.addLayer({
          id: 'kingpin-labels',
          type: 'symbol',
          source: 'kingpins',
          layout: {
            'text-field': ['coalesce', ['get', 'Name'], ['get', 'Retailer']],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 10,
              10, 12,
              12, 14,
              14, 16,
            ],
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#ff3b3b',
            'text-halo-width': 2,
          },
        });

        // Clusters
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'retailers',
          filter: ['has', 'point_count'],
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'point_count'],
              2, 16,
              10, 22,
              50, 28,
              150, 36,
            ],
            'circle-color': '#60a5fa',
            'circle-opacity': 0.85,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0f172a',
          },
        });

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'retailers',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count}',
            'text-size': 12,
          },
          paint: {
            'text-color': '#0b1021',
          },
        });

        // Unclustered (non-kingpin) points as colored dots
        map.addLayer({
          id: 'unclustered-dots',
          type: 'circle',
          source: 'retailers',
          filter: ['all', ['!', ['has', 'point_count']], ['!', kingpinFilterExpr]],
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 3.5,
              6, 6,
              10, 7,
              13, 8.5,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'Category'], 'Kingpin'], '#ff3b3b',
              ['==', ['get', 'Category'], 'Agronomy'], '#22c55e',
              ['==', ['get', 'Category'], 'Seed'], '#f59e0b',
              ['==', ['get', 'Category'], 'Office/Service'], '#60a5fa',
              '#93c5fd',
            ],
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#0b1021',
          },
        });

        // Optional: logo symbology (loaded lazily). Kept under an ID we can hide/show.
        map.addLayer({
          id: 'retailer-logos',
          type: 'symbol',
          source: 'retailers',
          filter: ['all', ['!', ['has', 'point_count']], ['!', kingpinFilterExpr]],
          layout: {
            'icon-image': ['concat', 'logo-', ['get', 'Retailer']],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 0.25,
              8, 0.35,
              12, 0.5,
              16, 0.7,
            ],
            'icon-allow-overlap': false,
            'icon-ignore-placement': false,
          },
          paint: {},
        });

        // Start with dots by default; we’ll toggle below
        map.setLayoutProperty('retailer-logos', 'visibility', 'none');

        // Lazy-load logos for all retailers we actually have
        for (const name of featuresByRetailer(fc)) {
          // Use a safe-path file name: /icons/<retailer>.png
          const file = `${basePath || ''}/icons/${encodeURIComponent(name)}.png`;
          await loadImageSafe(map, `logo-${name}`, file).catch(() => undefined);
        }

        // Hover popup (single instance)
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

        const hoverTargets = ['unclustered-dots', 'retailer-logos', 'kingpin-circles'];

        const onMove = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
          const f = map.queryRenderedFeatures(e.point, { layers: hoverTargets })[0];
          if (!f) {
            popupRef.current!.remove();
            map.getCanvas().style.cursor = '';
            return;
          }
          const props: any = f.properties || {};
          const content = `
            <div style="font-weight:700;margin-bottom:4px">${props.Retailer ?? ''}</div>
            <div>${props.Name ?? ''}</div>
            <div style="opacity:.8">${props.Category ?? ''}</div>
            <div style="opacity:.8">${[props.Address, props.City, props.State, props.Zip].filter(Boolean).join(', ')}</div>
          `;
          popupRef.current!
            .setLngLat((f.geometry as Point).coordinates as [number, number])
            .setHTML(content)
            .addTo(map);
          map.getCanvas().style.cursor = 'pointer';
        };

        const onLeave = () => {
          popupRef.current!.remove();
          map.getCanvas().style.cursor = '';
        };

        map.on('mousemove', hoverTargets, onMove);
        map.on('mouseleave', hoverTargets, onLeave);

        // Click -> callback for adding stops, etc.
        map.on('click', hoverTargets, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p: any = f.properties || {};
          const pt = (f.geometry as Point).coordinates as [number, number];
          onPointClick?.(pt, p.Name || p.Retailer || '');
        });

        // Zoom in on cluster click
        map.on('click', 'clusters', (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          const clusterId = features[0]?.properties?.cluster_id;
          const source = map.getSource('retailers') as mapboxgl.GeoJSONSource;
          if (!source || clusterId === undefined) return;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: (features[0].geometry as Point).coordinates as [number, number], zoom });
          });
        });
      }

      // Home marker
      if (home && Array.isArray(home)) {
        const [lng, lat] = home;
        const src: FeatureCollection<Point> = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: { type: 'home' },
          }],
        };
        map.addSource('home', { type: 'geojson', data: src });
        map.addLayer({
          id: 'home-pin',
          type: 'circle',
          source: 'home',
          paint: {
            'circle-radius': 8,
            'circle-color': '#22d3ee',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0b1021',
          },
        });
      }

      // Stops + route
      if (stops && stops.length) {
        const stopFc: FeatureCollection<Point> = {
          type: 'FeatureCollection',
          features: stops.map((s, i) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: s.coords },
            properties: { title: s.title, idx: i + 1 },
          })),
        };
        map.addSource('stops', { type: 'geojson', data: stopFc });
        map.addLayer({
          id: 'stop-dots',
          type: 'circle',
          source: 'stops',
          paint: {
            'circle-radius': 6,
            'circle-color': '#f59e0b',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0b1021',
          },
        });
        map.addLayer({
          id: 'stop-idx',
          type: 'symbol',
          source: 'stops',
          layout: {
            'text-field': ['to-string', ['get', 'idx']],
            'text-size': 11,
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#0b1021',
          },
        });
      }

      if (routeGeoJSON) {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-width': 4,
            'line-color': '#22d3ee',
          },
        });
      }

      // Map dbl-click handler
      map.on('dblclick', (e) => {
        onMapDblClick?.([e.lngLat.lng, e.lngLat.lat]);
      });

      // Toggle dots vs logos
      const applyMarkerMode = () => {
        const showLogos = markerLabel === 'Logos';
        map.setLayoutProperty('retailer-logos', 'visibility', showLogos ? 'visible' : 'none');
        map.setLayoutProperty('unclustered-dots', 'visibility', showLogos ? 'none' : 'visible');
      };
      applyMarkerMode();
    });

    return () => {
      window.removeEventListener('resize', rsz);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [baseLabel, markerLabel, token, wantsToken, basePath, JSON.stringify(bbox), globe, JSON.stringify(home), JSON.stringify(stops), JSON.stringify(routeGeoJSON), JSON.stringify(fc)]);

  // Re-apply marker mode if prop flips after load
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const showLogos = normalizeMarkerStyle(markerStyle) === 'Logos';
    try {
      map.setLayoutProperty('retailer-logos', 'visibility', showLogos ? 'visible' : 'none');
      map.setLayoutProperty('unclustered-dots', 'visibility', showLogos ? 'none' : 'visible');
    } catch {
      /* ignore if layers not ready yet */
    }
  }, [markerStyle]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />
  );
};

export default CertisMap;
