'use client'
import mapboxgl from 'mapbox-gl'
import { useEffect, useRef } from 'react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string

export default function Map({ geojson }: { geojson: any }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-92.767, 42.361],
      zoom: 6.5,
      cooperativeGestures: true
    })
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
        layout:{
          'text-field':['to-string', ['get','point_count']],
          'text-size':12
        }
      })
      map.addLayer({
        id:'unclustered',
        type:'symbol',
        source:'partners',
        filter:['!', ['has','point_count']],
        layout:{
          'icon-image': ['match', ['get','Category'],
            'Kingpin','town-hall',
            'Agronomy Center','farm',
            'Office','building',
            /* default */ 'marker'
          ],
          'icon-size': 1,
          'text-field':['get','Name'],
          'text-offset':[0, 1.2],
          'text-size': 11,
          'text-optional': true
        }
      })
    })
    return () => map.remove()
  }, [geojson])
  return <div ref={ref} style={{height:'100%', width:'100%'}} />
}
