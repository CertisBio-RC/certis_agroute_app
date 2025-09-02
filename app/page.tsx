'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const Map = dynamic(() => import('../components/Map'), { ssr: false })

export default function Page() {
  const [geojson, setGeojson] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function loadGeoJSON() {
    setLoading(true)
    const r = await fetch('data/retailers.geojson')
    const g = await r.json()
    setGeojson(g)
    setLoading(false)
  }

  async function optimize() {
    if (!geojson) return alert('Load data first')
    const coords = geojson.features.map((f:any)=>f.geometry.coordinates).join(';')
    const url = new URL(`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}`)
    url.searchParams.set('roundtrip','true')
    url.searchParams.set('source','first')
    url.searchParams.set('destination','last')
    url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN!)
    const res = await fetch(url.toString())
    const data = await res.json()
    if (data?.code !== 'Ok') { alert(`Optimization failed: ${data?.message || data?.code}`); return }
    alert('Optimization succeeded. (See console for result)')
    console.log('optimized result', data)
  }

  useEffect(() => { loadGeoJSON() }, [])

  return (
    <main style={{padding:24}}>
      <h1 style={{fontSize:24, fontWeight:700, marginBottom:8}}>certis_agroute_app — Mapbox (GitHub Pages)</h1>
      <p style={{opacity:.75, marginBottom:16}}>Static Next.js site. Loads GeoJSON from <code>public/</code>, calls Mapbox Optimization directly from the browser.</p>
      <div style={{display:'flex', gap:16, marginBottom:12}}>
        <button onClick={loadGeoJSON} style={{padding:'8px 12px', borderRadius:12, border:'1px solid #ddd'}}>Reload data</button>
        <button onClick={optimize} style={{padding:'8px 12px', borderRadius:12, border:'1px solid #ddd'}}>Optimize (client → Mapbox)</button>
      </div>
      <div style={{height: '70vh', border:'1px solid #eee', borderRadius:16, overflow:'hidden'}}>
        {!geojson && loading && <div style={{padding:12}}>Loading points…</div>}
        {geojson && <Map geojson={geojson} />}
      </div>
    </main>
  )
}
