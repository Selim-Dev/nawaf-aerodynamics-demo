import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { initSoundscape, useSound } from './audio/sound'
import { getAircraft, internalSystems } from './data/aircraft'
import { useT } from './i18n/useT'
import { presentation } from './presentation'
import { useStore } from './store'
import { Viewer } from './scene/Viewer'
import { SystemTools, toggleFullscreen, Toolbar, ViewDock } from './ui/Toolbar'
import { Sidebar } from './ui/Sidebar'
import { Panel } from './ui/Panel'
import { Tooltip } from './ui/Tooltip'
import { HotspotLayer } from './ui/HotspotLayer'
import { Intro } from './ui/Intro'
import { Nameplate } from './ui/Nameplate'
import { ControlsHint, EmbedGate, LoadingOverlay, PanelHandles, StageNotes } from './ui/Overlays'
import { stepPart } from './ui/partOrder'
import { useUi } from './ui/uiStore'

const AuthoringPanel = import.meta.env.DEV ? lazy(() => import('./authoring/AuthoringPanel')) : null

export default function App() {
  const aircraftId = useStore((s) => s.aircraftId)
  const lang = useStore((s) => s.lang)
  const level = useStore((s) => s.level)
  const activeSystem = useStore((s) => s.activeSystem)
  const setActiveSystem = useStore((s) => s.setActiveSystem)
  const authorMode = useStore((s) => s.authorMode)
  const phase = useUi((s) => s.phase)
  const backdrop = useUi((s) => s.backdrop)
  const sideOpen = useUi((s) => s.sideOpen)
  const panelOpen = useUi((s) => s.panelOpen)
  const data = getAircraft(aircraftId)
  const t = useT()
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.title = `${data.aircraft.name[lang]} · ${t('appTitle')}`
  }, [lang, data, t])

  // Entering the Systems view with nothing chosen shows the first system, so the view is never empty.
  useEffect(() => {
    if (level === 'systems' && !activeSystem) setActiveSystem(internalSystems(data)[0]?.id ?? null)
  }, [level, activeSystem, data, setActiveSystem])

  useEffect(() => initSoundscape(), [])

  // Keyboard: Esc closes, arrows step through the parts, R resets the view, H dots, M sound, F full screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) return
      const s = useStore.getState()
      // The authoring tools have their own keys (G, R, S, Enter, Esc).
      if (s.authorMode !== 'off' || useUi.getState().phase !== 'explore') return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (key === 'Escape') {
        if (drawer) setDrawer(false)
        else if (s.selected) s.select(null)
      } else if ((key === 'ArrowRight' || key === 'ArrowLeft') && s.selected) {
        // "Next" follows the reading direction: right in English, left in Arabic.
        stepPart(data, (key === 'ArrowRight') === (s.lang === 'en') ? 1 : -1)
        e.preventDefault()
      } else if (key === 'r') s.resetView()
      else if (key === 'h') s.toggleHotspots()
      else if (key === 'm') useSound.getState().toggle()
      else if (key === 'f') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, drawer])

  const intro = phase === 'intro'
  const authoring = authorMode !== 'off'
  const system = level === 'systems' ? data.systemsById.get(activeSystem ?? '') : undefined
  return (
    <>
    {/* While the opening screen is up, nothing behind it can be clicked or reached with Tab. */}
    <div
      className="app"
      inert={intro}
      data-level={level}
      data-drawer={drawer}
      data-phase={phase}
      data-side={sideOpen}
      data-panel={panelOpen}
      data-backdrop={level === 'systems' ? 'xray' : backdrop}
      style={{ '--sys': system?.color ?? '#4c9bff' } as CSSProperties}
    >
      <Toolbar data={data} onMenu={() => setDrawer((v) => !v)} />
      <aside className="sidebar" aria-label={t('parts')}>
        <Sidebar data={data} onPick={() => setDrawer(false)} />
      </aside>
      <button className="scrim" aria-hidden="true" tabIndex={-1} onClick={() => setDrawer(false)} />
      <main className="stage">
        <Viewer data={data} />
        <HotspotLayer data={data} />
        <Nameplate data={data} />
        {/* The authoring panel sits in the top corner, so its tools move down to the dock. */}
        {!authoring && <SystemTools />}
        <ViewDock withSystemTools={authoring} />
        <ControlsHint />
        <StageNotes data={data} />
        <PanelHandles />
        {!intro && <LoadingOverlay />}
        <EmbedGate />
        {AuthoringPanel && authoring && (
          <Suspense fallback={null}>
            <AuthoringPanel data={data} />
          </Suspense>
        )}
      </main>
      <Panel data={data} />
      <Tooltip data={data} />
    </div>
    {presentation.showIntro && <Intro data={data} />}
    </>
  )
}
