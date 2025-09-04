'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

// Avoid shadowing global Map type
const MapView = dynamic(() => import('../components/Map'), { ssr: false })

type FC = { type: 'FeatureCollection'; features: any[] }
type TripLeg = { index: number; geojson: any; stops: any[] }

// These are compiled at build time for GitHub Pages paths
const REPO = process.env.NEXT_PUBLIC_REPO_NAME || 'certis_agroute_app'
const BASE = `/${REPO}`

/** very defensive: keep only valid Point features with [lng,lat] numbers */
function sanitizePoints(fc: FC | null): FC | null {
  if (!fc) return null
  const feats = (fc.features || []).filter((f: any) => {
    const g = f?.geometry
    if (!g || g.type !== 'Point') return false
    const c = g.coordinates
    return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
  })
  return { type: 'FeatureCollection', features: feats }
}

export default function Page() {
  const [raw, setRaw] = useState<FC | null>(null)
  const [loading, setLoading] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)

  const [category, setCategory] = useState('All')
  const [retailer, setRetailer] = useState('All')
  const [statesSel, setStatesSel] = useState<string[]>([])
  const [legs, setLegs] = useState<TripLeg[]>([])

  // catch any client errors so the page never black-screens
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      // eslint-disable-next-line no-console
      console.error('window.onerror:', e?.message || e)
      setClientError(e?.message || String(e))
    }
    const onRej = (e: PromiseRejectionEvent) => {
      // eslint-disable-next-line no-console
      console.error('unhandledrejection:', e?.reason)
      setClientError(String(e?.reason || 'Unhandled rejection'))
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
    }
  }, [])

  async function loadGeoJSON() {
    setLoading(true)
    setFatal(null)
    try {
      const url = `${BASE}/data/retailers.geojson?ts=${Date.now()}`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Failed to fetch retailers.geojson: HTTP ${r.status}`)
      const j = (await r.json()) as FC
      if (!j?.features) throw new Error('retailers.geojson did not contain features[]')
      setRaw(j)
    } catch (e: any) {
      console.error('Data load failed:', e)
      setFatal(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGeoJSON()
  }, [])

  const categories = useMemo(() => {
    const fc = sanitizePoints(raw)
    if (!fc) return ['All']
    const s = new Set<string>()
    fc.features.forEach((f: any) => s.add(f?.properties?.Category || ''))
    return ['All', ...[...s].filter(Boolean).sort()]
  }, [raw])

  const retailers = useMemo(() => {
    const fc = sanitizePoints(raw)
    if (!fc) return ['All']
    const s = new Set<string>()
    fc.features.forEach((f: any) => s.add(f?.properties?.Retailer || ''))
    return ['All', ...[...s].filter(Boolean).sort()]
  }, [raw])

  const states = useMemo(() => {
    const fc = sanitizePoints(raw)
    if (!fc) return []
    const s = new Set<string>()
    fc.features.forEach((f: any) => s.add(f?.properties?.State || ''))
    return [...[...s].filter(Boolean).sort()]
  }, [raw])

  // Filtered & sanitized collection
  const filtered: FC | null = useMemo(() => {
    const fc = sanitizePoints(raw)
    if (!fc) return null
    const feats = fc.features.filter((f: any) => {
      const p = f?.properties || {}
      const okCat = category === 'All' || p.Category === category
      const okRet = retailer === 'All' || p.Retailer === retailer
      const okSt = statesSel.length === 0 || statesSel.includes(p.State || '')
      return okCat && okRet && okSt
    })
    return { type: 'FeatureCollection', features: feats }
  }, [raw, category, retailer, statesSel])

  function toggleState(abbr: string) {
    setStatesSel((prev) => (prev.includes(abbr) ? prev.filter((s) => s !== abbr) : [...prev, abbr]))
  }

  async function buildTrip() {
    try {
      const data = filtered
      if (!data || data.features.length < 2) {
        alert('Select at least two points.')
        return
      }

      // Group by state, chunk legs <= 12
      const byState = new globalThis.Map<string, any[]>()
      for (const f of data.features) {
        const st = f?.properties?.State || 'UNK'
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

          const coords = chunk.map((f: any) => f.geometry.coordinates.join(',')).join(';')
          const url = new URL(`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}`)
          url.searchParams.set('access_token', process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '')
          url.searchParams.set('roundtrip', 'true')
          url.searchParams.set('source', 'first')
          url.searchParams.set('destination', 'last')
          url.searchParams.set('overview', 'full')
          url.searchParams.set('geometries', 'geojson')

          const res = await fetch(url.toString())
          const out = await res.json()
          if (out?.code !== 'Ok' || !out?.trips?.length) {
            console.warn('Optimize failed:', out)
            continue
          }

          const line = out.trips[0].geometry
          const order: number[] = out.waypoints.map((w: any) => w.waypoint_index)
          const stops = order.map((i) => chunk[i])

          legsOut.push({ index: idx++, geojson: line, stops })
        }
      }
      if (legsOut.length === 0) {
        alert('No legs were created.')
        return
      }
      setLegs(legsOut)
    } catch (e) {
      console.error('buildTrip failed:', e)
      alert('Trip build failed. Check console for details.')
    }
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        certis_agroute_app — Mapbox (GitHub Pages)
      </h1>
      <p style={{ opacity: 0.75, marginBottom: 12 }}>
        Filter by State, Retailer, Category → Build optimized legs (≤12 each).
      </p>

      {/* Visible banner for any client-side error */}
      {clientError && (
        <div
          style={{
            padding: 12,
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            color: '#721c24',
            borderRadius: 8,
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          Client error: {clientError}
        </div>
      )}

      {!token && (
        <div
          style={{
            padding: 12,
            background: '#fff3cd',
            border: '1px solid #ffeeba',
            color: '#856404',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          Mapbox token missing. The map will not initialize. Ensure{' '}
          <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> is set at build time.
        </div>
      )}

      {fatal && (
        <div
          style={{
            padding: 12,
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            color: '#721c24',
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          Data load error: {fatal}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <button onClick={loadGeoJSON} disabled={loading}>
          {loading ? 'Loading…' : 'Reload data'}
        </button>
        <button onClick={buildTrip} disabled={!filtered || filtered.features.length < 2}>
          Build Trip
        </button>

        <label>
          Category:&nbsp;
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          Retailer:&nbsp;
          <select value={retailer} onChange={(e) => setRetailer(e.target.value)}>
            {retailers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* State multi-select */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
          maxHeight: 96,
          overflow: 'auto',
          padding: '6px 8px',
          border: '1px solid #ddd',
          borderRadius: 12,
        }}
      >
        <strong style={{ marginRight: 6 }}>States:</strong>
        {states.map((st) => (
          <label key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={statesSel.includes(st)} onChange={() => toggleState(st)} />
            {st}
          </label>
        ))}
      </div>

      <div style={{ height: '68vh', border: '1px solid #eee', borderRadius: 16, overflow: 'hidden' }}>
        {token && filtered && <MapView geojson={filtered} legs={legs} />}
        {!token && (
          <div style={{ padding: 16, color: '#666' }}>
            Map disabled: missing Mapbox token. Controls above still work.
          </div>
        )}
      </div>

      {legs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>Trip legs</h3>
          <ol>{legs.map((l) => <li key={l.index}>Leg {l.index}: {l.stops.length} stops</li>)}</ol>
        </div>
      )}
    </main>
  )
}
