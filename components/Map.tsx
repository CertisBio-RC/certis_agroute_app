'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl, {
  Map as MapboxMap,
  LngLatLike,
  GeoJSONSource,
} from 'mapbox-gl';
import type { FeatureCollection, Feature, Point } from 'geojson';
import { assetUrl } from '../utils/mapbox';

// Optional: keep for docs (not enforced on the prop anymore)
export type RetailerProps = {
  Retailer: string;
  Name: string;
  Category?: string;
  State?: string;
  Address?: string;
  City?: string;
  Zip?: string;
};

export type HomeLoc = { lng: number; lat: number };
type MarkerStyle = 'logo' | 'color';

type Props = {
  /** GeoJSON to render (clustered). Loosened so callers with similar types compile. */
  data?: FeatureCollection<Point, any>;
  markerStyle?: MarkerStyle;
  showLabels?: boolean;
  labelColor?: string;
  mapStyle: string;
  projection?: 'mercator' | 'globe';
  allowRotate?: boolean;
  rasterSharpen?: boolean;
  mapboxToken: string;
  center?: LngLatLike;
  zoom?: number;
  home?: HomeLoc | null;
  enableHomePick?: boolean;
  onPickHome?: (lng: number, lat: number) => void;
  className?: string;
};

const RETAILER_SOURCE_ID = 'retailers';
const CLUSTER_LAYER_ID = 'retailer-clusters';
const UNCLUSTERED_LAYER_ID = 'retailer-points';
const LABEL_LAYER_ID = 'retailer-labels';

const defer = (fn: () => void) => requestAnimationFrame(fn);

function logoCandidates(retailer: string): string[] {
  const base = retailer.trim();
  return [
    `${base} - Logo.png`,
    `${base} - Logo.jpg`,
    `${base} - Logo.jpeg`,
    `${base} - Logo.jfif`,
    `${base}.png`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.jfif`,
  ];
}

const MapView: React.FC<Props> = ({
  data,
  markerStyle = 'logo',
  showLabels = true,
  labelColor = '#ffffff',
  mapStyle,
  projection = 'mercator',
  allowRotate = true,
  rasterSharpen = false,
  mapboxToken,
  center = [-93.0, 41.5],
  zoom = 5,
  home = null,
  enableHomePick = false,
  onPickHome,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const isLoadedRef = useRef(false);
  const homeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const imageCacheRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mapboxgl.accessToken = mapboxToken;
  }, [mapboxToken]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle,
      center,
      zoom,
      cooperativeGestures: true,
      attributionControl: true,
      hash: false,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.once('load', () => {
      isLoadedRef.current = true;
      try {
        map.setProjection(projection as any);
      } catch {}
      setRotationEnabled(map, allowRotate);
      addOrUpdateDataSource(map, data);
      addOrRebuildLayers(map, { markerStyle, showLabels, labelColor });
      ensureHomeMarker(map, home);
    });

    const onStyleData = () => {
      if (!map.isStyleLoaded()) return;
      defer(() => {
        imageCacheRef.current.clear();
        addOrUpdateDataSource(map, data);
        addOrRebuildLayers(map, { markerStyle, showLabels, labelColor });
        ensureHomeMarker(map, home);
      });
    };
    map.on('styledata', onStyleData);

    return () => {
      map.off('styledata', onStyleData);
      try { map.remove(); } catch {}
      mapRef.current = null;
      isLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.setStyle(mapStyle); } catch {}
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    try { map.setProjection(projection as any); } catch {}
  }, [projection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    setRotationEnabled(map, allowRotate && projection !== 'globe' ? true : allowRotate);
  }, [allowRotate, projection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    addOrUpdateDataSource(map, data);
    addOrRebuildLayers(map, { markerStyle, showLabels, labelColor });
  }, [data, markerStyle, showLabels, labelColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    ensureHomeMarker(map, home);
  }, [home]);

  useEffect(() => {
    const _ = rasterSharpen;
  }, [rasterSharpen]);

  const addOrRebuildLayers = (
    map: MapboxMap,
    opts: { markerStyle: MarkerStyle; showLabels: boolean; labelColor: string }
  ) => {
    addOrUpdateDataSource(map, data);

    safeRemoveLayer(map, LABEL_LAYER_ID);
    safeRemoveLayer(map, UNCLUSTERED_LAYER_ID);
    safeRemoveLayer(map, CLUSTER_LAYER_ID);

    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: RETAILER_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#2f80ed',
        'circle-radius': ['step', ['get', 'point_count'], 15, 10, 18, 25, 22, 50, 28],
        'circle-opacity': 0.8,
        'circle-stroke-color': '#0b1d33',
        'circle-stroke-width': 1.5,
      },
    });

    if (opts.markerStyle === 'logo') {
      prewarmRetailerImages(map, data, imageCacheRef.current).then(() => {
        const matchExpr = buildIconMatchExpression(data, imageCacheRef.current);
        map.addLayer({
          id: UNCLUSTERED_LAYER_ID,
          type: 'symbol',
          source: RETAILER_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': matchExpr as any,
            'icon-size': 0.25,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
        addLabelLayer(map, opts);
      });
    } else {
      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'circle',
        source: RETAILER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 6,
          'circle-color': '#00d084',
          'circle-stroke-color': '#093b2c',
          'circle-stroke-width': 1.5,
        },
      });
      addLabelLayer(map, opts);
    }
  };

  const addLabelLayer = (
    map: MapboxMap,
    opts: { showLabels: boolean; labelColor: string }
  ) => {
    if (!opts.showLabels) return;
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: RETAILER_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'Name'],
        'text-size': 12,
        'text-offset': [0, 1.1],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': opts.labelColor || '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1.2,
      },
    });
  };

  const addOrUpdateDataSource = (map: MapboxMap, fc?: FeatureCollection<Point, any>) => {
    const src = map.getSource(RETAILER_SOURCE_ID) as GeoJSONSource | undefined;
    const clusterOpts: any = {
      type: 'geojson',
      data: fc ?? emptyFC,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 12,
    };
    if (!src) {
      map.addSource(RETAILER_SOURCE_ID, clusterOpts);
    } else {
      try {
        src.setData(fc ?? emptyFC);
      } catch {
        safeRemoveLayer(map, LABEL_LAYER_ID);
        safeRemoveLayer(map, UNCLUSTERED_LAYER_ID);
        safeRemoveLayer(map, CLUSTER_LAYER_ID);
        try { map.removeSource(RETAILER_SOURCE_ID); } catch {}
        map.addSource(RETAILER_SOURCE_ID, clusterOpts);
      }
    }
  };

  const ensureHomeMarker = (map: MapboxMap, homeLoc?: HomeLoc | null) => {
    if (homeMarkerRef.current) {
      try { homeMarkerRef.current.remove(); } catch {}
      homeMarkerRef.current = null;
    }
    if (!homeLoc) return;

    const el = document.createElement('div');
    el.style.width = '22px';
    el.style.height = '22px';
    el.style.borderRadius = '50%';
    el.style.background = '#ff375f';
    el.style.boxShadow = '0 0 0 2px #ffffff, 0 1px 8px rgba(0,0,0,0.45)';

    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([homeLoc.lng, homeLoc.lat])
      .addTo(map);

    homeMarkerRef.current = marker;
  };

  return (
    <div
      ref={containerRef}
      className={className ?? 'w-full h-[70vh] rounded-xl overflow-hidden border border-gray-800/40'}
    />
  );
};

const emptyFC: FeatureCollection<Point, any> = {
  type: 'FeatureCollection',
  features: [],
};

function safeRemoveLayer(map: MapboxMap, id: string) {
  if (map.getLayer(id)) {
    try { map.removeLayer(id); } catch {}
  }
}

function setRotationEnabled(map: MapboxMap, enabled: boolean) {
  try {
    if (enabled) {
      map.dragRotate.enable();
      (map.touchZoomRotate as any)?.enableRotation?.();
    } else {
      map.dragRotate.disable();
      (map.touchZoomRotate as any)?.disableRotation?.();
    }
  } catch {}
}

async function prewarmRetailerImages(
  map: MapboxMap,
  fc: FeatureCollection<Point, any> | undefined,
  cache: Set<string>
) {
  if (!fc) return;

  const names: string[] = [];
  for (const f of fc.features) {
    const r = String(f.properties?.Retailer ?? '').trim();
    if (r && !names.includes(r)) names.push(r);
    if (names.length >= 400) break;
  }

  const loadOne = (name: string) =>
    new Promise<void>((resolve) => {
      if (cache.has(name)) return resolve();
      const tries = logoCandidates(name);
      const tryNext = (i: number) => {
        if (i >= tries.length) return resolve();
        const url = assetUrl(`/icons/${tries[i]}`);
        map.loadImage(url, (err, img) => {
          if (!err && img) {
            try {
              if (!map.hasImage(name)) map.addImage(name, img as any, { pixelRatio: 2 });
              cache.add(name);
            } catch {}
            return resolve();
          }
          tryNext(i + 1);
        });
      };
      tryNext(0);
    });

  const pool = 12;
  let idx = 0;
  await Promise.all(
    new Array(Math.min(pool, names.length)).fill(0).map(async () => {
      while (idx < names.length) {
        const i = idx++;
        // eslint-disable-next-line no-await-in-loop
        await loadOne(names[i]);
      }
    })
  );
}

function buildIconMatchExpression(
  fc: FeatureCollection<Point, any> | undefined,
  cache: Set<string>
) {
  const expr: any[] = ['match', ['get', 'Retailer']];
  if (fc) {
    const seen = new Set<string>();
    for (const f of fc.features) {
      const r = String(f.properties?.Retailer ?? '').trim();
      if (!r || seen.has(r)) continue;
      seen.add(r);
      if (cache.has(r)) {
        expr.push(r, r);
      }
    }
  }
  expr.push('', 'marker-15');
  return expr as any;
}

export default MapView;

