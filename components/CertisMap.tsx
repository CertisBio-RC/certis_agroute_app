// components/CertisMap.tsx
'use client';

import mapboxgl, { Map, Popup, MapLayerMouseEvent } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef } from 'react';
import type { FeatureCollection, Feature, Point, Geometry } from 'geojson';

export type Stop = { title: string; coord: [number, number] };

export type CertisMapProps = {
  token: string;
  basemap: 'Hybrid' | 'Streets';
  data: FeatureCollection<Point, any>;
  bbox?: [number, number, number, number];
  home?: [number, number] | null;
  stops?: Stop[];
  routeGeoJSON?: FeatureCollection;
  onDblClickHome?: (lnglat: [number, number]) => void;
  onPointClick?: (lnglat: [number, number], title: string) => void;
};

const LAYER_IDS = {
  clusters: 'retailer-clusters',
  clusterCount: 'retailer-cluster-count',
  dots: 'retailer-dots',
  kingpins: 'kingpin-circles',
  route: 'trip-route',
  routeHalo: 'trip-route-halo',
};

function isKingpinProps(p: any): boolean {
  const v =
    p?.Category ??
    p?.category ??
    p?.Type ??
    p?.type ??
    p?.['Location Type'] ??
    p?.location_type ??
    '';
  return String(v).trim().toLowerCase() === 'kingpin';
}

/** Filter the incoming FeatureCollection down to kingpins only (kept unclustered). */
function kingpinsOnly(fc: FeatureCollection<Point, any>): FeatureCollection<Point, any> {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => isKingpinProps(f.properties || {})),
  };
}

export default function CertisMap({
  token,
  basemap,
  data,
  bbox,
  home,
  stops,
  routeGeoJSON,
  onDblClickHome,
  onPointClick,
}: CertisMapProps) {
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current!,
      style:
        basemap === 'Hybrid'
          ? 'mapbox://styles/mapbox/satellite-streets-v12'
          : 'mapbox://styles/mapbox/streets-v12',
      center: [-96.0, 41.5],
      zoom: 4,
      cooperativeGestures: false, // normal wheel zoom
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    mapRef.current = map;

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
    popupRef.current = popup;

    map.on('load', () => {
      // SOURCE A: clustered source for "everything" (used for clusters & non-kingpin dots)
      if (map.getSource('retailers')) map.removeSource('retailers');
      map.addSource('retailers', {
        type: 'geojson',
        data,
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 12,
      });

      // SOURCE B: non-clustered kingpin-only source (always visible)
      if (map.getSource('kingpins-src')) map.removeSource('kingpins-src');
      map.addSource('kingpins-src', {
        type: 'geojson',
        data: kingpinsOnly(data),
      });

      // Clusters (from SOURCE A)
      map.addLayer({
        id: LAYER_IDS.clusters,
        type: 'circle',
        source: 'retailers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4aa3ff',
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            18,
            20, 22,
            100, 28,
            250, 34,
          ],
          'circle-stroke-color': '#0b0e13',
          'circle-stroke-width': 2,
        },
      });

      // Cluster count
      map.addLayer({
        id: LAYER_IDS.clusterCount,
        type: 'symbol',
        source: 'retailers',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#fff' },
      });

      // Unclustered dots (from SOURCE A), but explicitly excluding kingpins
      map.addLayer({
        id: LAYER_IDS.dots,
        type: 'circle',
        source: 'retailers',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['downcase', ['coalesce', ['get', 'Category'], ['get', 'Type'], ['get', 'Location Type'], '']], 'kingpin']],
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['coalesce', ['get', 'Category'], ['get', 'Type'], ['get', 'Location Type'], ''],
            'Agronomy', '#2ecc71',
            'Agronomy/Grain', '#27ae60',
            'Distribution', '#8e44ad',
            'Grain', '#f39c12',
            'Office/Service', '#95a5a6',
            'Corporate Office', '#3498db',
            /* other */ '#1abc9c',
          ],
          'circle-stroke-color': '#0b0e13',
          'circle-stroke-width': 1.5,
        },
      });

      // KINGPINS (from SOURCE B, NON-CLUSTERED) – always on top
      map.addLayer({
        id: LAYER_IDS.kingpins,
        type: 'circle',
        source: 'kingpins-src',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 6, 9, 9, 12],
          'circle-color': '#ff4d4f',       // bright red
          'circle-stroke-color': '#ffd400',// yellow ring
          'circle-stroke-width': 3,
        },
      });

      // Route (halo then line)
      if (map.getSource('trip-route')) map.removeSource('trip-route');
      map.addSource('trip-route', {
        type: 'geojson',
        data: routeGeoJSON || { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: LAYER_IDS.routeHalo,
        type: 'line',
        source: 'trip-route',
        paint: { 'line-color': '#000', 'line-width': 7, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: LAYER_IDS.route,
        type: 'line',
        source: 'trip-route',
        paint: { 'line-color': '#00d084', 'line-width': 4 },
      });

      // Make sure kingpins are above everything else
      map.moveLayer(LAYER_IDS.kingpins);

      // Double-click to set Home
      map.on('dblclick', (e) => {
        e.preventDefault();
        onDblClickHome?.([e.lngLat.lng, e.lngLat.lat]);
      });

      // Click cluster => zoom into it
      map.on('click', LAYER_IDS.clusters, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0] as Feature | undefined;
        if (!f) return;
        const clusterId = (f.properties as any).cluster_id;
        const src = map.getSource('retailers') as mapboxgl.GeoJSONSource & {
          getClusterExpansionZoom: (id: number, cb: (err: any, zoom: number) => void) => void;
        };
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const center = (f.geometry as any).coordinates as [number, number];
          map.easeTo({ center, zoom });
        });
      });

      // Hover/tap popups for both dots & kingpins
      const popupTargets = [LAYER_IDS.dots, LAYER_IDS.kingpins];

      const showPopup = (e: MapLayerMouseEvent) => {
        const f = e.features?.[0] as Feature<Point, any> | undefined;
        if (!f) return;
        const p = f.properties || {};
        const name = (p['Retailer'] || p['Name'] || 'Unknown') as string;
        const addr = [p['Address1'], p['City'], p['State'], p['ZIP']]
          .filter(Boolean)
          .join(', ');
        const isKP = isKingpinProps(p);
        const html = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${name}</strong>
            ${isKP ? '<span class="badge">KINGPIN</span>' : ''}
          </div>
          <div style="font-size:13px;color:#bfc8d8">${addr}</div>
        `;
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        map.getCanvas().style.cursor = 'pointer';
      };

      popupTargets.forEach((layer) => {
        map.on('mousemove', layer, showPopup);
        map.on('mouseleave', layer, () => {
          popup.remove();
          map.getCanvas().style.cursor = '';
        });
        map.on('click', layer, (e) => {
          const f = e.features?.[0] as Feature<Point, any> | undefined;
          if (!f) return;
          const title = (f.properties?.['Retailer'] || f.properties?.['Name'] || 'Stop') as string;
          const [lng, lat] = (f.geometry.coordinates as [number, number]);
          onPointClick?.([lng, lat], title);
          showPopup(e);
        });
      });

      if (bbox) map.fitBounds(bbox, { padding: 24, duration: 500 });
    });

    return () => {
      popup.remove();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, basemap]);

  // Update sources when props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const retailers = map.getSource('retailers') as mapboxgl.GeoJSONSource | undefined;
    if (retailers) retailers.setData(data);
    const kps = map.getSource('kingpins-src') as mapboxgl.GeoJSONSource | undefined;
    if (kps) kps.setData(kingpinsOnly(data));
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const src = map.getSource('trip-route') as mapboxgl.GeoJSONSource | undefined;
    if (src && routeGeoJSON) src.setData(routeGeoJSON);
  }, [routeGeoJSON]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bbox) return;
    map.fitBounds(bbox, { padding: 24, duration: 500 });
  }, [bbox]);

  // Home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = 'home-point';
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    if (!home) return;

    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: home }, properties: {} }],
      },
    });
    map.addLayer({
      id,
      type: 'circle',
      source: id,
      paint: {
        'circle-radius': 7,
        'circle-color': '#00d084',
        'circle-stroke-color': '#0b0e13',
        'circle-stroke-width': 2,
      },
    });
  }, [home]);

  return <div ref={containerRef} className="map-card map-shell" />;
}
