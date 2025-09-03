'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
const Map = dynamic(() => import('../components/Map'), { ssr: false })

type FC = { type: 'FeatureCollection', features: any[] }
type TripLeg = { index: number, geojson: any, stops: any[] }

export default function Page() {
  const [raw, setRaw] = useState<FC | null>(null)
  const [loading, setLoading] = useState(false)

  const [category, setCategory] = useState('All')
  const [retailer, setRetailer] = useState('All')
  const [statesSel, setStatesSel] = useState<string[]>([])
  const [legs, setLegs] = useState<TripLeg[]>([])

  const base = process.env.NEXT_PUBLIC_REPO_NAME ? `/${process.env.NEXT_PUBLIC_REPO_NAME}` : ''

  async function loadGeoJSON() {
    setLoading(true)
    try {
      const r = await fetch(`${base}/data/retailers.geojson?ts=${Date.now()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setRaw(await r.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { loadGeoJSON() }, [])

  const categories = useMemo(() => {
    if (!raw) return ['All']
    const s = new Set<string>(); raw.features.forEach((f:any)=> s.add(f.properties.Category||''))
    return ['All', ...[...s].filter(Boolean).sort()]
  }, [raw])

  const retailers = useMemo(() => {
    if (!raw) return ['All']
    const s = new Set<string>(); raw.features.forEach((f:any)=> s.add(f.properties.Retailer||''))
    return ['All', ...[...s].filter(Boolean).sort()]
  }, [raw])

  const states = useMemo(() => {
    if (!raw) return []
    const s = new Set<string>(); raw.features.forEach((f:any)=> s.add(f.properties.State||''))
    return [...[...s].filter(Boolean).sort()]
  }, [raw])

  // Filter BEFORE passing to Mapbox (clusters reflect it)
  const filtered: FC | null = useMemo(() => {
    if (!raw) return null
    const feats = raw.features.filter((f:any) => {
      const p = f.properties || {}
      const okCat = category === 'All' || p.Category === category
      const okRet = retailer === 'All' || p.Retailer === retailer
      const okSt  = statesSel.length === 0 || statesSel.includes(p.State || '')
      return okCat && okRet && okSt
    })
    return { type:'FeatureCollection', features: feats }
  }, [raw, category, retailer, statesSel])

  function toggleState(abbr:string) {
    setStatesSel(prev => prev.includes(abbr) ? prev.filter(s=>s!==abbr) : [...prev, abbr])
  }

  async function buildTrip() {
    const data = filtered
    if (!data || data.features.length < 2) return alert('Select at least two points.')

    // group by state, then chunk into legs <= 12
    const byState = new Map<string, any[]>()
    for (const f of data.features) {
      const st = f.properties?.State || 'UNK'
      if (!byState.has(st)) byState.set(st, [])
      byState.get(st)!.push(f)
    }

    const legsOut: TripLeg[] = []
    const maxPerLeg = 12
    let idx = 1

    for (const [, arr] of byState) {
      for (let i = 0; i < arr.length; i += maxPerLeg) {
        const chunk = arr.slice(i, i + maxPerLeg)
        if (chunk.length < 2) continue

        const coords = chunk.map((f:any)=> f.geometry.coordinates.join(',')).join(';')
        const url = new URL(`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}`)
        url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN!)
        url.searchParams.set('roundtrip','true')
        url.searchParams.set('source','first')
        url.searchParams.set('destination','last')
        url.searchParams.set('overview','full')
        url.searchParams.set('geometries','geojson')

        const res = await fetch(url.toString())
        const out = await res.json()
        if (out?.code !== 'Ok' || !out?.trips?.length) { console.warn('Optimize failed:', out); continue }

        const line = out.trips[0].geometry
        const order: number[] = out.waypoints.map((w:any)=> w.waypoint_index)
        const stops = order.map(i => chunk[i])

        legsOut.push({ index: idx++, geojson: line, stops })
      }
    }
    if (legsOut.length === 0) { alert('No legs were created.'); return }
    setLegs(legsOut)
  }

  return (
    <main style={{padding:24}}>
      <h1 style={{fontSize:24, fontWeight:700, marginBottom:8}}>certis_agroute_app — Mapbox (GitHub Pages)</h1>
      <p style={{opacity:.75, marginBottom:16}}>Filter by State, Retailer, Category → Build optimized legs (≤12 each).</p>

      <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:12}}>
        <button onClick={loadGeoJSON}>Reload data</button>
        <button onClick={buildTrip}>Build Trip</button>
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

      {/* State multi-select */}
      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:12, maxHeight:96, overflow:'auto', padding:'6px 8px', border:'1px solid #ddd', borderRadius:12}}>
        <strong style={{marginRight:6}}>States:</strong>
        {states.map(st => (
          <label key={st} style={{display:'inline-flex', alignItems:'center', gap:4}}>
            <input type="checkbox" checked={statesSel.includes(st)} onChange={()=>toggleState(st)} />
            {st}
          </label>
        ))}
      </div>

      <div style={{height:'68vh', border:'1px solid #eee', borderRadius:16, overflow:'hidden'}}>
        {filtered && <Map geojson={filtered} legs={legs} />}
      </div>

      {legs.length > 0 && (
        <div style={{marginTop:12}}>
          <h3>Trip legs</h3>
          <ol>{legs.map(l => <li key={l.index}>Leg {l.index}: {l.stops.length} stops</li>)}</ol>
        </div>
      )}
    </main>
  )
}
