import { useEffect, useRef, useState } from 'react'
import { useSound } from '../audio/sound'
import { useT } from '../i18n/useT'
import { Icon } from './icons'

/**
 * Sound button for the toolbar. One click turns all sound on or off (the thing
 * a presenter needs fast); the small arrow opens the two volume sliders.
 */
export function SoundControl() {
  const t = useT()
  const s = useSound()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="sound" ref={box}>
      <button className="icon-btn" aria-pressed={s.enabled} aria-label={s.enabled ? t('mute') : t('unmute')} title={s.enabled ? t('mute') : t('unmute')} onClick={s.toggle}>
        {s.enabled ? <Equaliser playing={s.started} /> : <Icon name="mute" />}
      </button>
      <button className="icon-btn slim" aria-expanded={open} aria-label={t('soundSettings')} title={t('soundSettings')} onClick={() => setOpen((v) => !v)}>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="popover sound-pop" role="group" aria-label={t('soundSettings')}>
          <label className="slider">
            <span>{t('music')}</span>
            <input type="range" min={0} max={1} step={0.01} value={s.music} onChange={(e) => s.setMusic(Number(e.target.value))} disabled={!s.enabled} />
          </label>
          <label className="slider">
            <span>{t('effects')}</span>
            <input type="range" min={0} max={1} step={0.01} value={s.effects} onChange={(e) => s.setEffects(Number(e.target.value))} disabled={!s.enabled} />
          </label>
        </div>
      )}
    </div>
  )
}

/** Four small bars that move while the music plays. */
export function Equaliser({ playing }: { playing: boolean }) {
  return (
    <span className="eq" data-playing={playing} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
