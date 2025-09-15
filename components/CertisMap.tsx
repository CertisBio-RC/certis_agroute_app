'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import type { FeatureCollection, Feature, Point, Position } from 'geojson';
import mapboxgl, { Map, LngLatLike, LngLat } from 'mapbox-gl';
import { withBasePath } from '@/utils/paths';

export type CertisMapProps = {
  /** Main locations (all non-kingpins). MUST be a Point FeatureCollection. */
  main: FeatureCollection<Point, { [k: string]: any }>;
  /** Kingpin locations. MUST be a Point FeatureCollection. */
  kingpins: FeatureCollection<Point, { [k: string]: any }>;
  /** Optional home marker as [lng,lat]. */
  home?: Position | null;
  /** Click handler: add to trip builder. (legacy 2-arg signature kept) */
  onPointClick: (props: any, ll: LngLat) => void;
  /** 'hybrid' | 'street' */
  mapStyle: 'hybrid' | 'street';
};

const STYLE_HYBRID = 'mapbox://styles/mapbox/satellite-streets-v12';
const STYLE_STREET = 'mapbox://styles/mapbox/streets-v12';

const MAIN_SRC = 'main';
const MAIN_CLUSTERS = 'main-clusters';
const MAIN_CLUSTER_COUNT = 'main-cluster-count';
const MAIN_POINTS = 'main-points';

const KING_SRC = 'kingpins';
const KING_LAYER = 'kingpins-layer';

const HOME_SRC = 'home';
const HOME_LAYER = 'home-pin';

/** Category → color (matches the legend dots in the sidebar). */
export const CATEGORY_COLOR: Record<string, string> = {
  'Agronomy': '#3ee279',          // green
  'Agronomy/Grain': '#a060ff',    // purple
  'Distribution': '#19c2d8',      // cyan
  'Grain': '#ffb11a',             // orange
  'Grain/Feed': '#6b4a00',        // brown
  'Office/Service': '#4fa1ff',    // blue
  'Kingpin': '#ff3b3b',           // red (not used here—kingpins are separate source)
};

/** Pull a safe string prop from either cased key. */
function prop<T = any>(p: any, keys: string[], fallback: T): T {
  for (const k of keys) {
    if (p && p[k] != null) return p[k] as T;
  }
  return fallback;
}

/** Slug for finding logos in /public/icons/*.png */
function slugify(s: string) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Choose category off properties in a resilient way. */
function getCategory(p: any): string {
  const c = prop<string>(p, ['Category', 'category', 'Type', 'type'], '');
  // Normalize a few known variants
  const norm = c
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  if (CATEGORY_COLOR[norm]) return norm;
  // Heuristics
  if (/kingpin/i.test(norm)) return 'Kingpin';
  if (/office|service/i.test(norm)) return 'Office/Service';
  if (/agro.*grain|agronomy\/grain/i.test(norm)) return 'Agronomy/Grain';
  if (/agro|agronomy/i.test(norm)) return 'Agronomy';
  if (/grain\s*\/\s*feed|feed/i.test(norm)) return 'Grain/Feed';
  if (/grain/i.test(norm)) return 'Grain';
  if (/dist/i.test(norm)) return 'Distribution';
  return 'Agronomy'; // safe default
}

/** Mapbox color match expression based on CATEGORY_COLOR */
function categoryPaintExpression(): any[] {
  const expr: any[] = ['match', ['coalesce',
    ['get', 'Category'],
    ['get', 'category'],
    ['get', 'Type'],
    ['get', 'type'],
  ]];
  for (const [k, v] of Object.entries(CATEGORY_COLOR)) {
    expr.push(k, v);
  }
  // default
  expr.push('#3ee279');
  return expr;
}

function toPosLL(x?: Position | null): [number, number] | null {
  if (!x || x.length < 2) return null;
  return [x[0], x[1]];
}

const styleUrlFor = (mode: 'hybrid' | 'street') =>
  mode === 'hybrid' ? STYLE_HYBRID : STYLE_STREET;

/** One shared popup instance. */
function createPopup() {
  return new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: 'agroute-popup',
  });
}

/** Build popup HTML with optional retailer logo. */
function popupHTML(p: any) {
  const name = prop<string>(p, ['Retailer', 'retailer', 'Name', 'name', 'Location', 'location'], 'Location');
  const addr = prop<string>(p, ['Address', 'address'], '');
  const city = prop<string>(p, ['City', 'city'], '');
  const state = prop<string>(p, ['State', 'state'], '');
  const category = getCategory(p);
  const logoSlug = slugify(prop<string>(p, ['Retailer', 'retailer', 'Name', 'name'], ''));
  const logoUrl = withBasePath(`/icons/${logoSlug}.png`);

  const addrLine = [addr, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');

  return `
    <div class="agroute-pop">
      <div class="agroute-pop__row">
        <div class="agroute-pop__text">
          <div class="agroute-pop__name">${name}</div>
          ${addrLine ? `<div class="agroute-pop__addr">${addrLine}</div>` : ``}
          <div class="agroute-pop__cat"><span class="dot" style="background:${CATEGORY_COLOR[category] ?? '#3ee279'}"></span>${category}</div>
        </div>
        ${logoSlug ? `<img class="agroute-pop__logo" src="${logoUrl}" onerror="this.style.display='none'"/>` : ``}
      </div>
    </div>
  `;
}

/** Put kingpins above all cluster/point layers every time we (re)add layers. */
function layerOrder(map: Map) {
  try {
    if (map.getLayer(KING_LAYER)) map.moveLayer(KING_LAYER);
  } catch {}
}

const CertisMap: React.FC<CertisMapProps> = ({ main, kingpins, home, onPointClick, mapStyle }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Ensure a token (uses /public/mapbox-token as we’ve been doing)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If already set, keep it.
        if (mapboxgl.accessToken) return;
        const res = await fetch(withBasePath('/mapbox-token'));
        const t = (await res.text()).trim();
        if (!cancelled && t) mapboxgl.accessToken = t;
      } catch {
        // Let Mapbox complain in UI if missing
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrlFor(mapStyle),
      projection: { name: 'mercator' as any },
      center: [-94.5, 41.7], // Iowa-ish
      zoom: 5,
      attributionControl: false,
      preserveDrawingBuffer: false,
      hash: false,
      cooperativeGestures: true,
    });
    mapRef.current = m;

    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

    const resize = () => m.resize();
    window.addEventListener('resize', resize);

    const onStyleLoad = () => {
      // lock mercator
      try { m.setProjection({ name: 'mercator' as any }); } catch {}
      // Sources
      if (!m.getSource(MAIN_SRC)) {
        m.addSource(MAIN_SRC, {
          type: 'geojson',
          data: main,
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 14,
          promoteId: 'id',
          generateId: true,
        });
      }
      if (!m.getSource(KING_SRC)) {
        m.addSource(KING_SRC, { type: 'geojson', data: kingpins });
      }
      if (!m.getSource(HOME_SRC)) {
        m.addSource(HOME_SRC, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: toPosLL(home)
              ? [{
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: toPosLL(home)! },
                }]
              : [],
          },
        });
      }

      // Cluster circles
      if (!m.getLayer(MAIN_CLUSTERS)) {
        m.addLayer({
          id: MAIN_CLUSTERS,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#13b4cc',
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16, 10,
              20, 25,
              26,
            ],
            'circle-opacity': 0.85,
            'circle-stroke-color': '#0b3a43',
            'circle-stroke-width': 1.2,
          },
        });
      }
      if (!m.getLayer(MAIN_CLUSTER_COUNT)) {
        m.addLayer({
          id: MAIN_CLUSTER_COUNT,
          type: 'symbol',
          source: MAIN_SRC,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': '#ffffff',
          },
        });
      }

      // Unclustered main points
      if (!m.getLayer(MAIN_POINTS)) {
        m.addLayer({
          id: MAIN_POINTS,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': categoryPaintExpression(),
            'circle-radius': 6,
            'circle-stroke-width': 1.25,
            'circle-stroke-color': '#0d2231',
          },
        });
      }

      // Kingpins (above)
      if (!m.getLayer(KING_LAYER)) {
        m.addLayer({
          id: KING_LAYER,
          type: 'circle',
          source: KING_SRC,
          paint: {
            'circle-color': '#ff3b3b',
            'circle-radius': 6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffd400', // yellow ring
          },
        });
      }

      // Home
      if (!m.getLayer(HOME_LAYER)) {
        m.addLayer({
          id: HOME_LAYER,
          type: 'circle',
          source: HOME_SRC,
          paint: {
            'circle-color': '#ffffff',
            'circle-radius': 5,
            'circle-stroke-color': '#2d7ef6',
            'circle-stroke-width': 2,
          },
        });
      }

      // Interactions
      // cluster click → simple zoom-in (avoid removed v2 API)
      m.on('click', MAIN_CLUSTERS, (e) => {
        const f = e.features?.[0] as any;
        if (!f) return;
        const center = (f.geometry?.coordinates ?? null) as [number, number] | null;
        if (!center) return;
        m.easeTo({ center, zoom: Math.min(m.getZoom() + 2.25, 18) });
      });

      const showPopup = (e: mapboxgl.MapMouseEvent) => {
        const feats = m.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
        const feat = feats?.[0] as any as Feature<Point, any> | undefined;
        if (!feat) {
          popupRef.current?.remove();
          popupRef.current = null;
          m.getCanvas().style.cursor = '';
          return;
        }
        m.getCanvas().style.cursor = 'pointer';
        const html = popupHTML(feat.properties || {});
        if (!popupRef.current) popupRef.current = createPopup();
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(m);
      };

      const clickPoint = (e: mapboxgl.MapMouseEvent) => {
        const feats = m.queryRenderedFeatures(e.point, { layers: [KING_LAYER, MAIN_POINTS] });
        const feat = feats?.[0] as any as Feature<Point, any> | undefined;
        if (!feat) return;
        const ll = new LngLat(e.lngLat.lng, e.lngLat.lat);
        onPointClick(feat.properties || {}, ll);
      };

      m.on('mousemove', MAIN_POINTS, showPopup);
      m.on('mousemove', KING_LAYER, showPopup);
      m.on('mouseleave', MAIN_POINTS, () => {
        popupRef.current?.remove();
        popupRef.current = null;
        m.getCanvas().style.cursor = '';
      });
      m.on('mouseleave', KING_LAYER, () => {
        popupRef.current?.remove();
        popupRef.current = null;
        m.getCanvas().style.cursor = '';
      });

      m.on('click', MAIN_POINTS, clickPoint);
      m.on('click', KING_LAYER, clickPoint);

      layerOrder(m);
    };

    m.once('style.load', onStyleLoad);

    return () => {
      window.removeEventListener('resize', resize);
      popupRef.current?.remove();
      popupRef.current = null;
      m.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to style toggle
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const next = styleUrlFor(mapStyle);
    // if same URL, skip
    // @ts-expect-error mapbox type is fine
    if (m.getStyle()?.sprite?.includes(mapStyle)) return;
    m.setStyle(next);
    m.once('style.load', () => {
      // Rewire everything after style swap
      try { m.setProjection({ name: 'mercator' as any }); } catch {}
      if (!m.getSource(MAIN_SRC)) {
        m.addSource(MAIN_SRC, {
          type: 'geojson',
          data: main,
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 14,
          promoteId: 'id',
          generateId: true,
        });
      }
      if (!m.getSource(KING_SRC)) m.addSource(KING_SRC, { type: 'geojson', data: kingpins });
      if (!m.getSource(HOME_SRC)) {
        m.addSource(HOME_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      // layers again
      if (!m.getLayer(MAIN_CLUSTERS)) {
        m.addLayer({
          id: MAIN_CLUSTERS,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#13b4cc',
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 25, 26],
            'circle-opacity': 0.85,
            'circle-stroke-color': '#0b3a43',
            'circle-stroke-width': 1.2,
          },
        });
      }
      if (!m.getLayer(MAIN_CLUSTER_COUNT)) {
        m.addLayer({
          id: MAIN_CLUSTER_COUNT,
          type: 'symbol',
          source: MAIN_SRC,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: { 'text-color': '#ffffff' },
        });
      }
      if (!m.getLayer(MAIN_POINTS)) {
        m.addLayer({
          id: MAIN_POINTS,
          type: 'circle',
          source: MAIN_SRC,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': categoryPaintExpression(),
            'circle-radius': 6,
            'circle-stroke-width': 1.25,
            'circle-stroke-color': '#0d2231',
          },
        });
      }
      if (!m.getLayer(KING_LAYER)) {
        m.addLayer({
          id: KING_LAYER,
          type: 'circle',
          source: KING_SRC,
          paint: {
            'circle-color': '#ff3b3b',
            'circle-radius': 6,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffd400',
          },
        });
      }
      if (!m.getLayer(HOME_LAYER)) {
        m.addLayer({
          id: HOME_LAYER,
          type: 'circle',
          source: HOME_SRC,
          paint: {
            'circle-color': '#ffffff',
            'circle-radius': 5,
            'circle-stroke-color': '#2d7ef6',
            'circle-stroke-width': 2,
          },
        });
      }
      layerOrder(m);
      // refresh data right after re-add
      try {
        (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource)?.setData(main);
        (m.getSource(KING_SRC) as mapboxgl.GeoJSONSource)?.setData(kingpins);
        const homePos = toPosLL(home);
        (m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource)?.setData({
          type: 'FeatureCollection',
          features: homePos
            ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: homePos } }]
            : [],
        } as any);
      } catch {}
    });
  }, [mapStyle, main, kingpins, home]);

  // Live data updates without style swap
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    try { (m.getSource(MAIN_SRC) as mapboxgl.GeoJSONSource)?.setData(main); } catch {}
  }, [main]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    try { (m.getSource(KING_SRC) as mapboxgl.GeoJSONSource)?.setData(kingpins); } catch {}
  }, [kingpins]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const pos = toPosLL(home);
    try {
      (m.getSource(HOME_SRC) as mapboxgl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: pos ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pos } }] : [],
      } as any);
    } catch {}
  }, [home]);

  return (
    <div className="agroute-mapwrap">
      {/* watermark logo inside map */}
      <img
        className="agroute-maplogo"
        src={withBasePath('/certis-logo.png')}
        alt="CERTIS"
        draggable={false}
      />
      <div ref={containerRef} className="agroute-mapbox" />
    </div>
  );
};

export default CertisMap;
