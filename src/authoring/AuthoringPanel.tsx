/** Dev-only authoring panel (DOM side). Open the app with ?author=1. */
import { useEffect } from 'react'
import type { AircraftData } from '../data/aircraft'
import { internalSystems } from '../data/aircraft'
import { useStore } from '../store'
import { copyText, useAuthoring } from './authoringStore'
import './authoring.css'

export default function AuthoringPanel({ data }: { data: AircraftData }) {
  const mode = useStore((s) => s.authorMode)
  const setMode = useStore((s) => s.setAuthorMode)
  const override = useStore((s) => s.mappingOverride)
  const setOverride = useStore((s) => s.setMappingOverride)
  const level = useStore((s) => s.level)
  const setLevel = useStore((s) => s.setLevel)
  const activeSystem = useStore((s) => s.activeSystem)
  const a = useAuthoring()
  const mapping = override ?? data.mapping

  // Volumes are easiest to judge with each part painted its own colour.
  useEffect(() => {
    useStore.setState({ debugColors: mode === 'volumes' })
  }, [mode])

  // Keyboard shortcuts for the route and volume tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      const st = useAuthoring.getState()
      const m = useStore.getState().authorMode
      if (m === 'route') {
        if (e.key === 'Backspace') { e.preventDefault(); st.undoPoint() }
        if (e.key === 'Enter') copyRoute()
        if (e.key === 'Escape') st.clearRoute()
      }
      if (m === 'volumes') {
        if (e.key === 'g') st.setGizmo('translate')
        if (e.key === 'r') st.setGizmo('rotate')
        if (e.key === 's') st.setGizmo('scale')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const copyRoute = () => {
    const pts = useAuthoring.getState().routePoints
    if (pts.length < 2) return a.notify('Add at least two points')
    const sys = data.systemsById.get(activeSystem ?? '')
    const route = {
      id: `${activeSystem ?? 'system'}-route-${Date.now() % 10000}`,
      circuit: sys?.circuits?.[0]?.id,
      from: pts[0],
      to: pts[pts.length - 1],
      via: pts.slice(1, -1),
      radius: 0.04,
      flow: 1,
    }
    copyText(JSON.stringify(route), a.notify, 'Route JSON copied')
  }

  return (
    <div className="authoring" dir="ltr">
      <div className="au-tabs">
        {(['inspect', 'volumes', 'route'] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>

      {mode === 'inspect' && (
        <div className="au-body">
          <p className="au-hint">Click the model.</p>
          {a.pick ? (
            <>
              <dl>
                <dt>part</dt><dd>{a.pick.partId}</dd>
                <dt>mesh</dt><dd>{a.pick.sourceName || '(unnamed)'}</dd>
                <dt>point</dt><dd>[{a.pick.point.join(', ')}]</dd>
              </dl>
              <button onClick={() => copyText(`[${a.pick!.point.join(', ')}]`, a.notify)}>Copy point</button>
              <button onClick={() => copyText(a.pick!.sourceName, a.notify)}>Copy mesh name</button>
            </>
          ) : null}
        </div>
      )}

      {mode === 'volumes' && (
        <div className="au-body">
          <p className="au-hint">Select a volume, drag the gizmo (G move, R rotate, S scale). The model re-splits on release.</p>
          <ul className="au-list">
            {mapping.entries.flatMap((e, ei) =>
              (e.volumes ?? []).map((_, vi) => (
                <li key={`${ei}-${vi}`}>
                  <button
                    aria-pressed={a.selectedVolume?.entry === ei && a.selectedVolume?.volume === vi}
                    onClick={() => a.selectVolume({ entry: ei, volume: vi })}
                  >
                    {e.partId} #{vi + 1}
                  </button>
                </li>
              )),
            )}
          </ul>
          <button onClick={() => copyText(JSON.stringify(mapping, null, 2), a.notify, 'mapping.json copied')}>Copy mapping JSON</button>
          {override && <button onClick={() => setOverride(null)}>Discard edits</button>}
        </div>
      )}

      {mode === 'route' && (
        <div className="au-body">
          {level !== 'systems' && <button onClick={() => setLevel('systems')}>Switch to Systems view</button>}
          <p className="au-hint">
            Click to add points ({internalSystems(data).find((s) => s.id === activeSystem)?.name.en ?? 'no system'}).
            Points land inside the skin; Shift or the toggle puts them on the surface. Backspace undo, Enter copy, Esc clear.
          </p>
          <label className="au-check">
            <input type="checkbox" checked={a.surfaceMode} onChange={(e) => a.setSurfaceMode(e.target.checked)} /> surface points
          </label>
          <div className="au-views">
            {(['top', 'side', 'front', 'rear'] as const).map((v) => (
              <button key={v} onClick={() => a.requestView(v)}>{v}</button>
            ))}
          </div>
          <ol className="au-points">
            {a.routePoints.map((p, i) => <li key={i}>[{p.join(', ')}]</li>)}
          </ol>
          <button onClick={copyRoute}>Copy route JSON</button>
          <button onClick={a.clearRoute}>Clear</button>
        </div>
      )}
      {a.toast && <div className="au-toast">{a.toast}</div>}
    </div>
  )
}
