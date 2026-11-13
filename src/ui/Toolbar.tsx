import { useEffect, useState } from 'react'
import type { AircraftData } from '../data/aircraft'
import { aircraftList, getAircraft } from '../data/aircraft'
import { useL, useT } from '../i18n/useT'
import { presentation } from '../presentation'
import { useStore, type Cutaway } from '../store'
import { Icon, PlaneMark } from './icons'
import { SoundControl } from './SoundControl'
import { useUi } from './uiStore'

export function Toolbar({ data, onMenu }: { data: AircraftData; onMenu: () => void }) {
  const t = useT()
  const L = useL()
  const level = useStore((s) => s.level)
  const setLevel = useStore((s) => s.setLevel)

  return (
    <header className="toolbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label={t('menu')}>
        <Icon name="menu" size={20} />
      </button>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <PlaneMark />
        </span>
        <span className="brand-text">
          <strong>{t('appTitle')}</strong>
          <small>{t('appTagline')}</small>
        </span>
      </div>

      <label className="aircraft-select">
        <span className="visually-hidden">{t('aircraft')}</span>
        <select
          value={data.aircraft.id}
          onChange={(e) => {
            const url = new URL(window.location.href)
            url.searchParams.set('aircraft', e.target.value)
            window.location.href = url.toString()
          }}
        >
          {aircraftList.map((a) => (
            <option key={a.id} value={a.id}>
              {L(a.name)}
            </option>
          ))}
          <option disabled>{t('moreSoon')}</option>
        </select>
        <Icon name="chevronDown" size={14} />
      </label>

      <div className="segmented level" role="tablist" aria-label={t('systems')}>
        {(['exterior', 'systems'] as const).map((lvl) => (
          <button key={lvl} role="tab" aria-selected={level === lvl} onClick={() => setLevel(lvl)}>
            <Icon name={lvl === 'exterior' ? 'shape' : 'pulse'} size={16} />
            <span>{t(lvl)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-mid">
        <ClientBadge />
      </div>

      <div className="toolbar-end">
        <BackdropButton />
        <SoundControl />
        <FullscreenButton />
        <LangButton />
      </div>
    </header>
  )
}

/** Who the demo is presented to (see src/presentation.ts). Renders nothing when no name is set. */
export function ClientBadge() {
  const t = useT()
  const L = useL()
  if (!presentation.client) return null
  return (
    <div className="client-badge">
      <Icon name="spark" size={12} />
      <span className="cb-label">{t('badgeFor')}</span>
      <strong>
        <bdi>{L(presentation.client)}</bdi>
      </strong>
    </div>
  )
}

export function LangButton() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  return (
    <button className="chip lang" lang={lang === 'en' ? 'ar' : 'en'} aria-label={t('languageLabel')} onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
      {t('language')}
    </button>
  )
}

/** Studio or daylight around the aircraft. The Systems view always uses its own dark backdrop. */
function BackdropButton() {
  const t = useT()
  const backdrop = useUi((s) => s.backdrop)
  const setBackdrop = useUi((s) => s.setBackdrop)
  const systems = useStore((s) => s.level === 'systems')
  const label = backdrop === 'studio' ? t('backdropToDay') : t('backdropToStudio')
  return (
    <button className="icon-btn backdrop-btn" aria-label={label} title={label} disabled={systems} onClick={() => setBackdrop(backdrop === 'studio' ? 'daylight' : 'studio')}>
      <Icon name={backdrop === 'studio' ? 'sun' : 'moon'} />
    </button>
  )
}

function FullscreenButton() {
  const t = useT()
  const [on, setOn] = useState(false)
  useEffect(() => {
    const change = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
  // Not offered where the browser or the host page (an iframe without allow="fullscreen") forbids it.
  if (!document.fullscreenEnabled) return null
  const label = on ? t('exitFullscreen') : t('fullscreen')
  return (
    <button className="icon-btn desktop-only" aria-label={label} title={label} onClick={toggleFullscreen}>
      <Icon name={on ? 'exitFullscreen' : 'fullscreen'} />
    </button>
  )
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => {})
}

/** Camera and marker controls, floating at the bottom of the 3D view. */
export function ViewDock({ withSystemTools = false }: { withSystemTools?: boolean }) {
  const t = useT()
  const showHotspots = useStore((s) => s.showHotspots)
  const toggleHotspots = useStore((s) => s.toggleHotspots)
  const resetView = useStore((s) => s.resetView)
  return (
    <div className="dock" role="toolbar" aria-label={t('viewTools')}>
      {/* On phones the labels are hidden to save room, so the names are also given as labels. */}
      <button className="chip" onClick={resetView} aria-label={t('resetView')} title={t('resetView')}>
        <Icon name="reset" size={16} />
        <span>{t('resetView')}</span>
      </button>
      <button className="chip" aria-pressed={showHotspots} onClick={toggleHotspots} aria-label={t('hotspots')} title={t('hotspots')}>
        <Icon name="target" size={16} />
        <span>{t('hotspots')}</span>
      </button>
      {withSystemTools && <SystemTools bare />}
    </div>
  )
}

/** Cutaway, frames and flow: only meaningful in the Systems view. */
export function SystemTools({ bare = false }: { bare?: boolean }) {
  const t = useT()
  const s = useStore()
  const system = getAircraft(s.aircraftId).systemsById.get(s.activeSystem ?? '')
  const hasFlow = !!system?.routes.some((r) => r.flow)
  if (s.level !== 'systems') return null
  const tools = (
    <>
      <div className="segmented small" role="radiogroup" aria-label={t('cutaway')}>
        <span className="seg-label">
          <Icon name="cutaway" size={15} />
          {t('cutaway')}
        </span>
        {(['none', 'top', 'side'] as Cutaway[]).map((c) => (
          <button key={c} role="radio" aria-checked={s.cutaway === c} onClick={() => s.setCutaway(c)}>
            {t(c === 'none' ? 'cutNone' : c === 'top' ? 'cutTop' : 'cutSide')}
          </button>
        ))}
      </div>
      <button className="chip" aria-pressed={s.showStructure} onClick={s.toggleStructure}>
        <Icon name="frames" size={16} />
        <span>{t('structure')}</span>
      </button>
      {hasFlow && (
        <button className="chip" aria-pressed={s.flow} onClick={s.toggleFlow}>
          <Icon name="flow" size={16} />
          <span>{t('flow')}</span>
        </button>
      )}
    </>
  )
  if (bare) return tools
  return (
    <div className="system-tools" role="toolbar" aria-label={t('systemsTools')}>
      {tools}
    </div>
  )
}
