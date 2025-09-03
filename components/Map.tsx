'use client'
import mapboxgl from 'mapbox-gl'
import { useEffect, useRef } from 'react'
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string

export default function Map({ geojson }: { geojson: any }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  // Create the map once
  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // or streets-v12
      center: [-93.5, 41.7],
      zoom: 4.2,
      cooperativeGestures: true
    })
    mapRef.current = map

    map.on('load', () => {
      map.addSource('partners', { type:'geojson', data: geojson, cluster:true, clusterRadius:40 })

      map.addLayer({
        id:'clusters',
        type:'circle',
        source:'partners',
        filter:['has','point_count'],
        paint:{
          'circle-radius': 18,
          'circle-color': ['interpolate', ['linear'], ['get','point_count'], 5, '#a7f3d0', 50, '#34d399', 150, '#059669'],
          'circle-opacity': 0.85
        }
      })
      map.addLayer({
        id:'cluster-count',
        type:'symbol',
        source:'partners',
        filter:['has','point_count'],
        layout:{ 'text-field':['to-string', ['get','point_count']], 'text-size':12 }
      })
      map.addLayer({
        id:'unclustered',
        type:'symbol',
        source:'partners',
        filter:['all', ['!', ['has','point_count']]],
        layout:{
          'icon-image': ['match', ['get','Category'],
            'Kingpin','town-hall',
            'Agronomy','farm',
            'Office','building',
            /*default*/ 'marker'
          ],
          'icon-size': 1,
          'text-field':['get','Name'],
          'text-offset':[0, 1.2],
          'text-size': 11,
          'text-optional': true
        }
      })

      // Fit to current data
      const b = new mapboxgl.LngLatBounds()
      geojson.features.forEach((f:any)=> b.extend(f.geometry.coordinates))
      if (!b.isEmpty()) map.fitBounds(b, { padding: 40, duration: 800 })

      // Click interactions
      map.on('click', 'clusters', (e:any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const clusterId = features[0].properties!.cluster_id
        ;(map.getSource('partners') as any).getClusterExpansionZoom(clusterId, (err:number, zoom:number) => {
          if (err) return
          map.easeTo({ center: (features[0].geometry as any).coordinates, zoom })
        })
      })
      map.on('click', 'unclustered', (e:any) => {
        const f = e.features[0]
        const p = f.properties as any
        const html = `
          <div style="font-family:system-ui">
            <div style="font-weight:700;margin-bottom:4px">${p.Name || ''}</div>
            <div><b>Retailer:</b> ${p.Retailer || ''}</div>
            <div><b>Category:</b> ${p.Category || ''}</div>
            <div><b>Suppliers:</b> ${p.Suppliers || ''}</div>
            <div><b>Address:</b> ${p.Address || ''}</div>
          </div>`
        new mapboxgl.Popup({ closeOnMove: true })
          .setLngLat((f.geometry as any).coordinates)
          .setHTML(html)
          .addTo(map)
      })
      map.on('mouseenter','unclustered',()=> map.getCanvas().style.cursor='pointer')
      map.on('mouseleave','unclustered',()=> map.getCanvas().style.cursor='')
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ✅ When the filtered geojson changes, update the source + refit
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('partners') as mapboxgl.GeoJSONSource
    if (!src) return
    src.setData(geojson)

    const b = new mapboxgl.LngLatBounds()
    geojson.features.forEach((f:any)=> b.extend(f.geometry.coordinates))
    if (!b.isEmpty()) map.fitBounds(b, { padding: 40, duration: 400 })
  }, [geojson])

  return <div ref={ref} style={{height:'100%', width:'100%'}} />
}
