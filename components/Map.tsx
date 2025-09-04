'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

type Props = {
  geojson: { type: 'FeatureCollection'; features: any[] }
  legs?: { index: number; geojson: any; stops: any[] }[]
}

function clean(fc: Props['geojson']) {
  const feats = (fc.features || []).filter((f: any) => {
    const g = f?.geometry
    if (!g || g.type !== 'Point') return false
    const c = g.coordinates
    return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
  })
  return { type: 'FeatureCollection', features: feats } as const
}

export default function MapComponent({ geojson, legs = [] }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const errRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) {
        errRef.current = 'Mapbox token missing'
        return
      }
      mapboxgl.accessToken = token

      const el = mountRef.current
      if (!el) return

      const map = new mapboxgl.Map({
        container: el,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-93.0, 41.5],
        zoom: 4,
        attributionControl: true,
      })
      mapRef.current = map

      map.on('load', () => {
        try {
          const safe = clean(geojson)

          if (!map.getSource('retailers')) {
            map.addSource('retailers', {
              type: 'geojson',
              data: safe as any,
              cluster: true,
              clusterMaxZoom: 10,
              clusterRadius: 40,
            })
          } else {
            const src = map.getSource('retailers') as mapboxgl.GeoJSONSource
            src.setData(safe as any)
          }

          if (!map.getLayer('clusters')) {
            map.addLayer({
              id: 'clusters',
              type: 'circle',
              source: 'retailers',
              filter: ['has', 'point_count'],
              paint: {
                'circle-color': '#34d399',
                'circle-radius': ['step', ['get', 'point_count'], 16, 50, 22, 200, 30],
                'circle-opacity': 0.85,
              },
            })
          }
          if (!map.getLayer('cluster-count')) {
            map.addLayer({
              id: 'cluster-count',
              type: 'symbol',
              source: 'retailers',
              filter: ['has', 'point_count'],
              layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
              paint: { 'text-color': '#053B2B' },
            })
          }
          if (!map.getLayer('unclustered')) {
            map.addLayer({
              id: 'unclustered',
              type: 'circle',
              source: 'retailers',
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-color': '#10b981',
                'circle-radius': 6,
                'circle-stroke-color': '#052e2b',
                'circle-stroke-width': 1,
              },
            })
          }

          // legs
          if (Array.isArray(legs) && legs.length) {
            legs.forEach((leg) => {
              const srcId = `leg-src-${leg.index}`
              const layerId = `leg-layer-${leg.index}`
              if (!map.getSource(srcId)) {
                map.addSource(srcId, {
                  type: 'geojson',
                  data: { type: 'Feature', geometry: leg.geojson } as any,
                })
              }
              if (!map.getLayer(layerId)) {
                map.addLayer({
                  id: layerId,
                  type: 'line',
                  source: srcId,
                  paint: { 'line-color': '#60a5fa', 'line-width': 4 },
                })
              }
            })
          }

          // fit bounds safely
          try {
            const pts = (safe.features || []).map((f: any) => f.geometry.coordinates)
            if (pts.length > 0) {
              const b = pts.slice(1).reduce(
                (acc: mapboxgl.LngLatBounds, c: [number, number]) => acc.extend(c),
                new mapboxgl.LngLatBounds(pts[0], pts[0])
              )
              map.fitBounds(b, { padding: 60, duration: 600 })
            }
          } catch (e) {
            console.warn('fitBounds skipped:', e)
          }
        } catch (e: any) {
          console.error('Mapbox layer/source error:', e)
          errRef.current = e?.message || String(e)
        }
      })
    } catch (e: any) {
      console.error('Map init failed:', e)
      errRef.current = e?.message || String(e)
    }

    return () => {
      try {
        mapRef.current?.remove()
      } catch {
        // ignore
      }
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(geojson?.features), JSON.stringify(legs)])

  if (errRef.current) {
    return (
      <div style={{ padding: 16, color: '#721c24', background: '#f8d7da', height: '100%' }}>
        Map error: {errRef.current}
      </div>
    )
  }
  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
