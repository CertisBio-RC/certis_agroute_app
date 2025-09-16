'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { Map } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection, Feature, Point } from 'geojson';
import { withBasePath } from '@/utils/paths';

export type StopLike = { name?: string; coord: [number, number]; [k: string]: any };

export type CertisMapProps = {
  /** "hybrid" = satellite-streets; "street" = streets */
  styleMode: 'hybrid' | 'street';
  /** Optional client-side category filter (by feature.properties.category) */
  categories?: string[];
  /** Called when the user clicks a point */
  onAddStop?: (s: StopLike) => void;
  /** Called once supplier data loads */
  onDataLoaded?: (summary: { count: number; categories: Record<string, number> }) => void;
};

const STYLE_HYBRID = 'mapbox://styles/mapbox/satellite-streets-v12';
const STYLE_STREET = 'mapbox://styles/mapbox/streets-v12';

const SUPPLIERS_SRC = 'suppliers-src';
const CLUSTER_LAYER = 'suppliers-clusters';
const CLUSTER_COUNT_LAYER = 'suppliers-cluster-count';
const POINT_LAYER = 'suppliers-points';

export const CATEGORY_COLOR: Record<string, string> = {
  Agronomy: '#19c37d',
  'Agronomy/Grain': '#a855f7',
  Distribution: '#06b6d4',
  Grain: '#f5a623',
  'Grain/Feed': '#8b5a2b',
  Kingpin: '#ef4444',
  'Office/Service': '#3b82f6',
};

function styleUrlFor(mode: 'hybrid' | 'street') {
  return mode === 'street' ? STYLE_STREET : STYLE_HYBRID;
}

function matchCategoryExpression(): any {
  // ['match', ['get','category'], 'Agronomy', '#19c37d', ... , '#cccccc']
  const entries: any[] = [];
  for (const [k, v] of Object.entries(CATEGORY_COLOR)) {
    entries.push(k, v);
  }
  return ['match', ['get', 'category'], ...entries, '#cccccc'];
}

function filterByCategories(categories?: string[]): any {
  if (!categories || categories.length === 0) return true; // show none? we’ll show all instead
  // ['in', ['get','category'], ['literal', categories]]
  return ['in', ['get', 'category'], ['literal', categories]];
}

async function fetchText(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}
async function fetchJSON<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export default function CertisMap(props: CertisMapProps) {
  const { styleMode, categories, onAddStop, onDataLoaded } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const styleUrl = useMemo(() => styleUrlFor(styleMode), [styleMode]);

  // Build or rebuild the map whenever style changes
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setError(null);
      setReady(false);

      // 1) Token
      let token: string;
      try {
        token = (await fetchText(withBasePath('/mapbox-token'))).trim();
      } catch {
        setError(
          'Missing /mapbox-token. Create public/mapbox-token with your pk.* Mapbox token.'
        );
        return;
      }
      if (!token || !token.startsWith('pk.')) {
        setError('Invalid Mapbox token. Ensure public/mapbox-token contains your pk.* token.');
        return;
      }
      mapboxgl.accessToken = token;

      // 2) Create Map (Mercator locked)
      if (!containerRef.current) return;
      // Destroy any previous map fully
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: [-96.0, 41.5],
        zoom: 3.6,
        projection: { name: 'mercator' as any },
        attributionControl: true,
        dragRotate: false,
        touchPitch: false,
      });
      mapRef.current = map;

      // Controls
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', async () => {
        if (cancelled) return;

        try {
          // 3) Load suppliers (retailers)
          let fc: FeatureCollection<Point, any> | null = null;
          try {
            fc = await fetchJSON<FeatureCollection<Point, any>>(
              withBasePath('/data/retailers.geojson')
            );
          } catch {
            // try fallback
            try {
              fc = await fetchJSON<FeatureCollection<Point, any>>(
                withBasePath('/data/main.geojson')
              );
            } catch {
              // ignore; we’ll show an overlay below
            }
          }

          if (fc && fc.type === 'FeatureCollection') {
            // Summary back to the page
            if (onDataLoaded) {
              const buckets: Record<string, number> = {};
              for (const f of fc.features) {
                const c = (f.properties?.category as string) || 'Unknown';
                buckets[c] = (buckets[c] || 0) + 1;
              }
              onDataLoaded({ count: fc.features.length, categories: buckets });
            }

            // Source (+cluster)
            map.addSource(SUPPLIERS_SRC, {
              type: 'geojson',
              data: fc,
              cluster: true,
              clusterMaxZoom: 12,
              clusterRadius: 42,
              generateId: true,
            });

            // Clusters
            map.addLayer({
              id: CLUSTER_LAYER,
              type: 'circle',
              source: SUPPLIERS_SRC,
              filter: ['has', 'point_count'],
              paint: {
                'circle-color': [
                  'step',
                  ['get', 'point_count'],
                  '#165c7d',
                  25,
                  '#1f7aa1',
                  100,
                  '#2ba8db',
                ],
                'circle-radius': ['step', ['get', 'point_count'], 12, 25, 16, 100, 22],
                'circle-stroke-width': 1.25,
                'circle-stroke-color': '#0d2231',
              },
            });

            map.addLayer({
              id: CLUSTER_COUNT_LAYER,
              type: 'symbol',
              source: SUPPLIERS_SRC,
              filter: ['has', 'point_count'],
              layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 11,
              },
              paint: { 'text-color': '#dbeafe' },
            });

            // Unclustered points
            map.addLayer({
              id: POINT_LAYER,
              type: 'circle',
              source: SUPPLIERS_SRC,
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-color': matchCategoryExpression(),
                'circle-radius': 6,
                'circle-stroke-width': 1.25,
                'circle-stroke-color': '#0d2231',
              },
            });

            // Cluster expand on click
            map.on('click', CLUSTER_LAYER, (e) => {
              const f = e.features?.[0] as any;
              const cid = f?.properties?.cluster_id;
              const src = map.getSource(SUPPLIERS_SRC) as mapboxgl.GeoJSONSource;
              if (src && cid != null) {
                // @ts-ignore Mapbox GL v3 supports this on GeoJSONSource
                src.getClusterExpansionZoom(cid, (err: any, zoom: number) => {
                  if (err) return;
                  const center = (f.geometry?.coordinates as [number, number]) || map.getCenter();
                  map.easeTo({ center, zoom });
                });
              }
            });
            map.on('mouseenter', CLUSTER_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
            map.on('mouseleave', CLUSTER_LAYER, () => (map.getCanvas().style.cursor = ''));

            // Point click -> onAddStop
            map.on('click', POINT_LAYER, (e) => {
              const f = e.features?.[0] as Feature<Point, any> | undefined;
              if (!f) return;
              const coord = f.geometry.coordinates as [number, number];
              const name = (f.properties?.name as string) || 'Stop';
              onAddStop?.({ name, coord, ...f.properties });
            });
            map.on('mouseenter', POINT_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
            map.on('mouseleave', POINT_LAYER, () => (map.getCanvas().style.cursor = ''));
          } else {
            setError(
              'No supplier data found. Publish public/data/retailers.geojson (or public/data/main.geojson).'
            );
          }

          setReady(true);
        } catch (err: any) {
          setError(err?.message || 'Map initialization failed.');
        }
      });
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [styleUrl, onAddStop, onDataLoaded]);

  // Live category filtering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setFilter(POINT_LAYER, ['all', ['!', ['has', 'point_count']], filterByCategories(categories)]);
    } catch {
      // layer not ready yet; ignore
    }
  }, [categories]);

  return (
    <div className="relative w-full h-[72vh] min-h-[520px]">
      <div ref={containerRef} className="absolute inset-0 rounded-xl overflow-hidden" />
      {/* overlay messages */}
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-transparent pointer-events-none">
          <div className="px-3 py-2 text-sm text-slate-300 bg-slate-900/60 rounded-md border border-slate-600">
            Loading map…
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="max-w-[720px] px-4 py-3 rounded-lg bg-red-900/60 border border-red-500 text-red-100">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
