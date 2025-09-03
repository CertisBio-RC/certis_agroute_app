'use client'
import mapboxgl from 'mapbox-gl'
import { useEffect, useRef } from 'react'
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string

export default function Map({ geojson, legs = [] }: { geojson:any, legs?: { index:number, geojson:any }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-93.5, 41.7],
      zoom: 4.2,
      cooperativeGestures: true
    })
    mapRef.current = map
    map.on('load', () => {
      map.addSource('partners', { type:'geojson', data: geojson, cluster:true, clusterRadius:40 })
      // your existing cluster / symbol layers here…
    })
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // update points
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('partners') as mapboxgl.GeoJSONSource
    if (src) src.setData(geojson)
  }, [geojson])

  // draw legs as lines
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // remove previous
    map.getStyle().layers?.forEach(l => { if (l.id.startsWith('leg-line-')) map.removeLayer(l.id) })
    Object.keys(map.getStyle().sources||{}).forEach(id => { if (id.startsWith('leg-src-')) map.removeSource(id) })

    const palette = ['#ff6b6b','#4dabf7','#51cf66','#f59f00','#845ef7','#e64980','#00d1b2','#ff922b']
    legs.forEach((leg:any, i:number) => {
      const srcId = `leg-src-${leg.index}`
      const lyrId = `leg-line-${leg.index}`
      map.addSource(srcId, { type:'geojson', data: { type:'Feature', geometry: leg.geojson, properties:{} } })
      map.addLayer({ id: lyrId, type:'line', source: srcId, paint: { 'line-width': 4, 'line-color': palette[i % palette.length] } })
    })
  }, [legs])

  return <div ref={ref} style={{height:'100%', width:'100%'}} />
}
