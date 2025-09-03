'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
const Map = dynamic(() => import('../components/Map'), { ssr: false })

export default function Page() {
  const [geojson, setGeojson] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string>('All')
  const [retailer, setRetailer] = useState<string>('All')
  const base = process.env.NEXT_PUBLIC_REPO_NAME ? `/${process.env.NEXT_PUBLIC_REPO_NAME}` : ""

  async function loadGeoJSON() {
    try {
      setLoading(true)
      const r = await fetch(`${base}/data/retailers.geojson?ts=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const g = await r.json()
      setGeojson(g)
    } finally { setLoading(false) }
  }
  useEffect(() => { loadGeoJSON() }, [])

  const categories = useMemo(() => {
    if (!geojson) return ['All']
    const s = new Set<string>(); geojson.features.forEach((f:any)=> s.add(f.properties.Category||''))
    return ['All', ...[...s].filter(Boolean).sort()]
  }, [geojson])

  const retailers = useMemo(() => {
    if (!geojson) return ['All']
    const s = new Set<string>(); geojson.features.forEach((f:any)=> s.add(f.properties.Retailer||''))
    return ['All', ...[...s].filter(Boolean).sort()]
  }, [geojson])

  async function optimize() {
    if (!geojson) return alert('Load data first')
    const coords = geojson.features.map((f:any)=>f.geometry.coordinates).join(';')
    const url = new URL(`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}`)
    url.searchParams.set('roundtrip','true'); url.searchParams.set('source','first'); url.searchParams.set('destination','last')
    url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN!)
    const res = await fetch(url.toString()); const data = await res.json()
    if (data?.code !== 'Ok') { alert(`Optimization failed: ${data?.message || data?.code}`); return }
    alert('Optimization succeeded. (See console)'); console.log('optimized result', data)
  }

  return (
    <main style={{padding:24}}>
      <h1 style={{fontSize:24, fontWeight:700, marginBottom:8}}>certis_agroute_app — Mapbox (GitHub Pages)</h1>
      <p style={{opacity:.75, marginBottom:16}}>Static Next.js site. Loads GeoJSON from <code>public/</code>, calls Mapbox Optimization directly.</p>

      <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
        <button onClick={loadGeoJSON} style={{padding:'8px 12px', borderRadius:12, border:'1px solid #ddd'}}>Reload data</button>
        <button onClick={optimize} style={{padding:'8px 12px', borderRadius:12, border:'1px solid #ddd'}}>Optimize (client → Mapbox)</button>

        <label>Category:&nbsp;
          <select value={category} onChange={e=>setCategory(e.target.value)}>
            {categories.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Retailer:&nbsp;
          <select value={retailer} onChange={e=>setRetailer(e.target.value)}>
            {retailers.map(r=> <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>

      <div style={{height: '70vh', border:'1px solid #eee', borderRadius:16, overflow:'hidden'}}>
        {!geojson && loading && <div style={{padding:12}}>Loading points…</div>}
        {geojson && <Map geojson={geojson} filters={{category, retailer}} />}
      </div>
    </main>
  )
}
