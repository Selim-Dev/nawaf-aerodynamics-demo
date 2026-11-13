import { useState, type CSSProperties } from 'react'
import type { AircraftData } from '../data/aircraft'
import type { Media } from '../data/schema'
import { useL, useT } from '../i18n/useT'
import { deviceIsTouch, useStore } from '../store'
import { Icon } from './icons'
import { orderedPartIds, stepPart } from './partOrder'

/**
 * Part details. On desktop it is a column beside the 3D view; on narrow screens
 * CSS turns it into a bottom sheet that peeks with the name and summary and
 * expands for the rest.
 *
 * With nothing selected it shows the aircraft's data sheet instead.
 */
export function Panel({ data }: { data: AircraftData }) {
  const selected = useStore((s) => s.selected)
  const part = selected ? data.partsById.get(selected) : undefined
  return part ? <PartDetails key={part.id} data={data} partId={part.id} /> : <DataSheet data={data} />
}

function DataSheet({ data }: { data: AircraftData }) {
  const t = useT()
  const L = useL()
  const level = useStore((s) => s.level)
  const { specs, sources, highlights } = data.aircraft
  return (
    <aside className="panel" data-empty="true">
      <div className="panel-inner">
        <header className="sheet-head">
          <span className="eyebrow">{t('dataSheet')}</span>
          <h2>
            <bdi>{L(data.aircraft.name)}</bdi>
          </h2>
          {data.aircraft.tagline && <p>{L(data.aircraft.tagline)}</p>}
        </header>

        {highlights && highlights.length > 0 && (
          <dl className="tiles" aria-label={t('keyFigures')}>
            {highlights.map((h, i) => {
              const [value, unit] = splitUnit(L(h.value))
              return (
                <div key={i} className="tile">
                  <dd>
                    <bdi>{value}</bdi>
                    {unit && <small>{unit}</small>}
                  </dd>
                  <dt>{L(h.label)}</dt>
                </div>
              )
            })}
          </dl>
        )}

        <div className="hint-card">
          <Icon name={deviceIsTouch ? 'hand' : 'mouse'} size={22} />
          <div>
            <strong>{t('emptyTitle')}</strong>
            <p>{level === 'systems' ? t('emptySystems') : deviceIsTouch ? t('emptyBodyTouch') : t('emptyBody')}</p>
          </div>
        </div>

        {specs.length > 0 && (
          <section className="specs">
            {specs.map((group, i) => (
              <div key={i} className="spec-group">
                <h3>{L(group.title)}</h3>
                <dl>
                  {group.rows.map((row, j) => (
                    <div key={j} className="spec-row">
                      <dt>{L(row.label)}</dt>
                      <dd>
                        <bdi>{L(row.value)}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {sources.length > 0 && (
              <div className="spec-sources">
                <h3>{t('sources')}</h3>
                <ul>
                  {sources.map((s, i) => (
                    <li key={i}>
                      <span dir="ltr">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title}
                          </a>
                        ) : (
                          s.title
                        )}
                      </span>
                      {s.note && <p dir="auto">{L(s.note)}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}

/** "37.57 m" becomes ["37.57", "m"], so the number can be set large and the unit small. */
function splitUnit(text: string): [string, string] {
  const i = text.lastIndexOf(' ')
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)]
}

function PartDetails({ data, partId }: { data: AircraftData; partId: string }) {
  const t = useT()
  const L = useL()
  const level = useStore((s) => s.level)
  const activeSystem = useStore((s) => s.activeSystem)
  const lang = useStore((s) => s.lang)
  const select = useStore((s) => s.select)
  const part = data.partsById.get(partId)!
  const system = data.systemsById.get(part.system)
  // Each part mounts a fresh copy of this component (see Panel), so the sheet starts folded for every part.
  const [expanded, setExpanded] = useState(false)
  const ids = orderedPartIds(data, level, activeSystem)
  const index = ids.indexOf(partId)

  return (
    <aside className="panel" data-empty="false" data-expanded={expanded} aria-live="polite" style={{ '--chip': system?.color ?? '#4c9bff' } as CSSProperties}>
      <div className="panel-inner">
        <div className="panel-head">
          <button className="sheet-grip" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? t('collapse') : t('expand')} />
          <div className="panel-title">
            {system && (
              <span className="system-chip">
                <bdi>{L(system.name)}</bdi>
              </span>
            )}
            <h2>
              <bdi>{L(part.name)}</bdi>
            </h2>
          </div>
          <button className="icon-btn" onClick={() => select(null)} aria-label={t('close')} title={t('close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="panel-body">
          <p className="lead" dir="auto">
            {L(part.short)}
          </p>
          <button className="sheet-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('collapse') : t('expand')}
          </button>
          <div className="panel-more">
            {part.location && (
              <dl className="facts">
                <dt>
                  <Icon name="pin" size={15} />
                  {t('location')}
                </dt>
                <dd dir="auto">{L(part.location)}</dd>
              </dl>
            )}
            {part.details[lang].map((para, i) => (
              <p key={i} dir="auto">
                {para}
              </p>
            ))}
            {part.media?.map((m, i) => <MediaView key={i} media={m} />)}
          </div>
        </div>
        <footer className="panel-foot">
          <button className="icon-btn ring" onClick={() => stepPart(data, -1)} aria-label={t('prevPart')} title={t('prevPart')} disabled={ids.length < 2}>
            <Icon name="arrowLeft" className="flip-rtl" />
          </button>
          <button className="btn-primary" onClick={() => select(part.id, { focus: true })}>
            <Icon name="focus" size={17} />
            <span>{t('zoomTo')}</span>
          </button>
          <button className="icon-btn ring" onClick={() => stepPart(data, 1)} aria-label={t('nextPart')} title={t('nextPart')} disabled={ids.length < 2}>
            <Icon name="arrowRight" className="flip-rtl" />
          </button>
          {index >= 0 && (
            <span className="step-count" dir="ltr">
              {index + 1} / {ids.length}
            </span>
          )}
        </footer>
      </div>
    </aside>
  )
}

function MediaView({ media }: { media: Media }) {
  const L = useL()
  const src = /^https?:/.test(media.src) ? media.src : import.meta.env.BASE_URL + media.src
  return (
    <figure className="media">
      {media.type === 'image' && <img src={src} alt={L(media.caption)} loading="lazy" />}
      {media.type === 'video' && <video src={src} poster={media.poster} controls playsInline preload="none" />}
      {media.type === 'youtube' && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${media.src}`}
          title={L(media.caption) || 'video'}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
      {media.caption && <figcaption>{L(media.caption)}</figcaption>}
    </figure>
  )
}
