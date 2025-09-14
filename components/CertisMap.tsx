'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Feature, FeatureCollection, Point, Geometry } from 'geojson';

type Basemap = 'Hybrid' | 'Streets';
type GJFC = FeatureCollection<Geometry, any>;

export interface CertisMapProps {
  token: string;
  basemap: Basemap;
  data: GJFC;                                     // all retailers
  bbox?: [number, number, number, number];        // fit when data changes
  home?: [number, number] | null;
  onPointClick?: (lnglat: [number, number], title: string) => void;
}

const styleFor = (b: Basemap) =>
  b === 'Hybrid'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/streets-v12';

const layerIds = {
  clusters: 'clusters',
  clusterCount: 'cluster-count',
  dots: 'unclustered-dots',
  kingpins: 'kingpin-circles',
  home: 'home-pin',
  stops: 'stops-line',
};

export default function CertisMap({
  token,
  basemap,
  data,
  bbox,
  home,
  onPointClick,
}: CertisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  // Split data once (for a stable non-clustered kingpin source)
  const { clustered, kingpinOnly } = useMemo(() => {
    const features = data?.features || [];
    const kPins: Feature<Point, any>[] = [];
    const nonKPins: Feature<Point, any>[] = [];
    for (const f of features) {
      if (f.geometry?.type === 'Point') {
        const kp = !!(f.properties && (f.properties.isKingpin || f.properties.KINGPIN));
        if (kp) kPins.push(f as Feature<Point, any>);
        else nonKPins.push(f as Feature<Point, any>);
      }
    }
    const clustered: GJFC = { type: 'FeatureCollection', features: nonKPins };
    const kingpinOnly: GJFC = { type: 'FeatureCollection', features: kPins };
    return { clustered, kingpinOnly };
  }, [data]);

  // Init once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleFor(basemap),
      center: [-96.7, 41.2],
      zoom: 4.1,
      attributionControl: true,
      cooperativeGestures: true,
    });
    mapRef.current = map;

    // Brand overlay in the map frame
    class BrandControl {
      _div: HTMLDivElement | null = null;
      onAdd() {
        const d = document.createElement('div');
        d.className = 'map-brand';
        d.innerHTML =
          `<img src="/certis_logo_light.svg" onerror="this.src='/logo-certis.png';" alt="Certis Biologicals" />`;
        this._div = d;
        return d;
      }
      onRemove() {
        if (this._div?.parentNode) this._div.parentNode.removeChild(this._div);
        this._div = null;
      }
    }
    map.addControl(new BrandControl() as any, 'top-left');

    // Sources & layers after style load
    map.on('load', () => {
      // Clustered source for non-kingpins
      map.addSource('retailers', {
        type: 'geojson',
        data: clustered as any,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 60,
      });

      // Non-clustered source for always-on-top kingpins
      map.addSource('kingpins', {
        type: 'geojson',
        data: kingpinOnly as any,
      });

      // Cluster bubbles
      map.addLayer({
        id: layerIds.clusters,
        type: 'circle',
        source: 'retailers',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4B8DFF',
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16, 10, 20, 25, 26, 50, 30, 100, 34,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0b1220',
        },
      });

      map.addLayer({
        id: layerIds.clusterCount,
        type: 'symbol',
        source: 'retailers',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });

      // Non-clustered dots (non-kingpin)
      map.addLayer({
        id: layerIds.dots,
        type: 'circle',
        source: 'retailers',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['==', ['get', 'Type'], 'Agronomy'],
            '#23d3a3',
            ['==', ['get', 'Type'], 'Distribution'],
            '#d6a2ff',
            ['==', ['get', 'Type'], 'Office/Service'],
            '#88c2ff',
            '#6ad5a8',
          ],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 6, 12, 7.5, 15, 9],
          'circle-stroke-color': '#0b1220',
          'circle-stroke-width': 1.5,
        },
      });

      // Always-on-top KINGPINS
      map.addLayer({
        id: layerIds.kingpins,
        type: 'circle',
        source: 'kingpins',
        paint: {
          'circle-color': '#ff3b30',                 // bright red
          'circle-stroke-color': '#ffd54f',         // yellow ring
          'circle-stroke-width': 3,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6.5, 8, 8, 12, 10, 15, 12],
        },
      });

      // Hover/tap popups (kingpins first so they win hit-test)
      const hoverTargets = [layerIds.kingpins, layerIds.dots];

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'certis-popup',
        maxWidth: '320px',
        offset: [0, -6],
      });

      const renderPopup = (f: Feature) => {
        const p: any = f.properties || {};
        const name = p.Name || p.Retailer || 'Location';
        const loc = [p.City, p.State].filter(Boolean).join(', ');
        const type = p.Type || '';
        const kp = p.isKingpin || p.KINGPIN ? '<span class="kp-badge">KINGPIN</span>' : '';
        const logoImg =
          p.LogoPath
            ? `<img class="popup-logo" src="${p.LogoPath}" alt="${name}" />`
            : '';
        return `
          <div class="popup-wrap">
            <div class="popup-title">${name} ${kp}</div>
            ${logoImg}
            ${type ? `<div class="popup-sub">${type}</div>` : ''}
            ${loc ? `<div class="popup-sub">${loc}</div>` : ''}
          </div>`;
      };

      const handleHover = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
        const f = map.queryRenderedFeatures(e.point, { layers: hoverTargets })[0];
        if (!f) {
          popupRef.current?.remove();
          return;
        }
        const g = f as any as Feature;
        const coords = (g.geometry as Point).coordinates as [number, number];
        popupRef.current!
          .setLngLat(coords)
          .setHTML(renderPopup(g))
          .addTo(map);
      };

      const handleLeave = () => popupRef.current?.remove();

      for (const lid of hoverTargets) {
        map.on('mousemove', lid, handleHover);
        map.on('mouseleave', lid, handleLeave);
      }

      // Clicks:
      // 1) expand clusters
      map.on('click', layerIds.clusters, (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [layerIds.clusters] });
        const clusterId = features[0]?.properties?.cluster_id;
        const src = map.getSource('retailers') as any;
        if (!clusterId || !src?.getClusterExpansionZoom) return;
        src.getClusterExpansionZoom(clusterId, (_err: any, zoom: number) => {
          const center = (features[0].geometry as any).coordinates as [number, number];
          map.easeTo({ center, zoom });
        });
      });

      // 2) add stop on point/kingpin click
      const addStopFrom = (e: any) => {
        const f = map.queryRenderedFeatures(e.point, { layers: [e.featuresLayer] })[0] as any;
        if (!f) return;
        const p = f.properties || {};
        const name = p.Name || p.Retailer || 'Stop';
        const coords = (f.geometry as any).coordinates as [number, number];
        onPointClick?.(coords, name);
      };
      map.on('click', layerIds.dots, (e: any) => addStopFrom({ ...e, featuresLayer: layerIds.dots }));
      map.on('click', layerIds.kingpins, (e: any) => addStopFrom({ ...e, featuresLayer: layerIds.kingpins }));

      // Home pin layer (optional)
      if (home) {
        map.addSource('home', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', geometry: { type: 'Point', coordinates: home } as Point, properties: {} },
            ],
          },
        });
        map.addLayer({
          id: layerIds.home,
          type: 'circle',
          source: 'home',
          paint: {
            'circle-color': '#00ffa0',
            'circle-stroke-color': '#053b2c',
            'circle-stroke-width': 3,
            'circle-radius': 8,
          },
        });
      }

      // Fit on first load
      if (bbox) map.fitBounds(bbox, { padding: 28, duration: 300 });
    });

    return () => {
      try {
        popupRef.current?.remove();
        map.remove();
      } catch {}
      popupRef.current = null;
      mapRef.current = null;
    };
  }, []); // init once

  // Style switch
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const style = styleFor(basemap);
    if (m.getStyle()?.name?.includes(basemap)) return;
    m.setStyle(style);

    // After style load, re-add sources/layers with latest data (handled below)
    const onStyle = () => {
      // Trigger data refresh effect
      refreshData();
    };
    m.once('styledata', onStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // Data refresh whenever clustered/kingpinOnly/home/bbox changes
  const refreshData = () => {
    const m = mapRef.current;
    if (!m) return;

    // retailers
    const r = m.getSource('retailers') as mapboxgl.GeoJSONSource;
    if (r) r.setData({ type: 'FeatureCollection', features: (clustered.features as any) });

    // kingpins
    const k = m.getSource('kingpins') as mapboxgl.GeoJSONSource;
    if (k) k.setData({ type: 'FeatureCollection', features: (kingpinOnly.features as any) });

    // home
    if (home) {
      const hs = m.getSource('home') as mapboxgl.GeoJSONSource;
      const gj = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: home } as Point, properties: {} }],
      } as any;
      if (hs) hs.setData(gj);
      else {
        m.addSource('home', { type: 'geojson', data: gj });
        if (!m.getLayer(layerIds.home)) {
          m.addLayer({
            id: layerIds.home,
            type: 'circle',
            source: 'home',
            paint: {
              'circle-color': '#00ffa0',
              'circle-stroke-color': '#053b2c',
              'circle-stroke-width': 3,
              'circle-radius': 8,
            },
          });
        }
      }
    } else {
      if (m.getLayer(layerIds.home)) m.removeLayer(layerIds.home);
      if (m.getSource('home')) m.removeSource('home');
    }

    if (bbox) m.fitBounds(bbox, { padding: 28, duration: 300 });
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clustered, kingpinOnly, JSON.stringify(home), JSON.stringify(bbox)]);

  return <div ref={containerRef} className="map-card" />;
}
