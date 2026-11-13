import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useSound } from '../audio/sound'
import type { AircraftData } from '../data/aircraft'
import { useL, useT } from '../i18n/useT'
import { presentation } from '../presentation'
import { useStore } from '../store'
import { Icon, PlaneMark } from './icons'
import { Equaliser } from './SoundControl'
import { LangButton } from './Toolbar'
import { useUi } from './uiStore'

/**
 * The opening screen: the aircraft's name over the live 3D view, who the demo
 * is for, and one button to begin. Pressing it also starts the sound, because
 * browsers only allow audio after a click.
 *
 * It lets vertical swipes through (touch-action: pan-y), so on a phone a page
 * that embeds the viewer can still be scrolled past it.
 */
export function Intro({ data }: { data: AircraftData }) {
  const t = useT()
  const L = useL()
  const phase = useUi((s) => s.phase)
  const enter = useUi((s) => s.enter)
  const modelIn = useStore((s) => s.sceneVersion > 0)
  const { active, progress } = useProgress()
  const sound = useSound((s) => s.enabled)
  const toggleSound = useSound((s) => s.toggle)
  const ready = modelIn && !active
  const leaving = phase === 'explore'
  const [gone, setGone] = useState(false)
  const startBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (ready) startBtn.current?.focus({ preventScroll: true })
  }, [ready])

  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setGone(true), 1000)
    return () => window.clearTimeout(id)
  }, [leaving])

  if (gone) return null

  const start = () => {
    useSound.getState().unlock()
    enter()
  }
  const { aircraft } = data
  const figures = (aircraft.highlights ?? []).slice(0, 4)

  return (
    <div className="intro" data-ready={ready} data-leaving={leaving} aria-hidden={leaving}>
      <div className="intro-curtain" />
      <div className="intro-shade" />

      <header className="intro-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <PlaneMark />
          </span>
          <span className="brand-text">
            <strong>{t('appTitle')}</strong>
            <small>{t('appTagline')}</small>
          </span>
        </div>
        <div className="intro-actions">
          <button className="chip" aria-pressed={sound} onClick={toggleSound}>
            {sound ? <Equaliser playing /> : <Icon name="mute" size={16} />}
            <span>{sound ? t('soundOn') : t('soundOff')}</span>
          </button>
          <LangButton />
        </div>
      </header>

      <div className="intro-body">
        {presentation.client && (
          <div className="intro-for">
            <span className="if-label">{t('introFor')}</span>
            <strong className="if-name">
              <bdi>{L(presentation.client)}</bdi>
            </strong>
          </div>
        )}

        <div className="intro-main">
          {aircraft.manufacturer && <span className="intro-maker">{L(aircraft.manufacturer)}</span>}
          <h1 className="intro-name" dir="ltr">
            {aircraft.designation ?? L(aircraft.name)}
          </h1>
          {aircraft.tagline && <p className="intro-tag">{L(aircraft.tagline)}</p>}

          {figures.length > 0 && (
            <dl className="intro-figures">
              {figures.map((f, i) => (
                <div key={i}>
                  <dd>
                    <bdi>{L(f.value)}</bdi>
                  </dd>
                  <dt>{L(f.label)}</dt>
                </div>
              ))}
            </dl>
          )}

          <div className="intro-cta">
            {ready ? (
              <button ref={startBtn} className="btn-start" onClick={start}>
                <span>{t('start')}</span>
                <Icon name="arrowRight" size={18} className="flip-rtl" />
              </button>
            ) : (
              <div className="intro-loading" role="status">
                <div className="loading-bar">
                  <span style={{ width: `${Math.max(6, Math.round(modelIn ? 100 : progress * 0.9))}%` }} />
                </div>
                <p>{t('loading')}</p>
              </div>
            )}
          </div>
          <p className="intro-hint">{t('introHint')}</p>
        </div>
      </div>
    </div>
  )
}
