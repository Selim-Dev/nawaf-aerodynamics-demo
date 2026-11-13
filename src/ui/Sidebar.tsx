import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AircraftData } from '../data/aircraft'
import { drawnPartIds, internalSystems } from '../data/aircraft'
import type { Part } from '../data/schema'
import { useL, useT } from '../i18n/useT'
import { useStore } from '../store'
import { Icon } from './icons'
import { normalise } from './partOrder'
import { ClientBadge } from './Toolbar'
import { useUi } from './uiStore'

/** Exterior: every part grouped by category. Systems: system picker, legend and its components. */
export function Sidebar({ data, onPick }: { data: AircraftData; onPick: () => void }) {
  const t = useT()
  const level = useStore((s) => s.level)
  const query = useUi((s) => s.query)
  const setQuery = useUi((s) => s.setQuery)
  const label = level === 'exterior' ? t('searchParts') : t('searchComponents')
  return (
    <nav className="sidebar-inner">
      <div className="side-head">
        <label className="search">
          <Icon name="search" size={16} />
          <input type="search" value={query} placeholder={label} aria-label={label} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
          {query && (
            <button className="icon-btn slim" aria-label={t('clearSearch')} onClick={() => setQuery('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="side-scroll">
        {level === 'exterior' ? <PartsList data={data} onPick={onPick} /> : <SystemsList data={data} onPick={onPick} />}
        <div className="side-foot mobile-only">
          <ClientBadge />
        </div>
      </div>
    </nav>
  )
}

/** Keeps the parts whose name, in either language, contains what was typed. */
function useFilter() {
  const q = normalise(useUi((s) => s.query))
  return (parts: Part[]) => (q ? parts.filter((p) => normalise(p.name.en).includes(q) || normalise(p.name.ar).includes(q)) : parts)
}

/** Scrolls the list just enough to show an item (the list only, never the page). */
function reveal(el: HTMLElement) {
  const box = el.closest<HTMLElement>('.side-scroll')
  if (!box) return
  const item = el.getBoundingClientRect()
  const view = box.getBoundingClientRect()
  if (item.top < view.top + 8) box.scrollBy({ top: item.top - view.top - 48, behavior: 'smooth' })
  else if (item.bottom > view.bottom - 8) box.scrollBy({ top: item.bottom - view.bottom + 48, behavior: 'smooth' })
}

function PartButton({ id, label, onPick }: { id: string; label: string; onPick: () => void }) {
  const selected = useStore((s) => s.selected === id)
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)
  const ref = useRef<HTMLButtonElement>(null)
  // A part chosen on the aircraft, or with Previous / Next, is brought into view in the list.
  useEffect(() => {
    if (selected && ref.current) reveal(ref.current)
  }, [selected])
  return (
    <li>
      <button
        ref={ref}
        className="list-item"
        aria-current={selected}
        onClick={() => {
          select(id, { focus: true })
          onPick()
        }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered({ partId: id })}
        onPointerLeave={() => setHovered(null)}
      >
        <bdi>{label}</bdi>
      </button>
    </li>
  )
}

function PartsList({ data, onPick }: { data: AircraftData; onPick: () => void }) {
  const t = useT()
  const L = useL()
  const filter = useFilter()
  const searching = !!useUi((s) => s.query)
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  // A part chosen on the aircraft opens its group if the learner had folded it.
  const selectedGroup = useStore((s) => (s.selected ? data.partsById.get(s.selected)?.system : undefined))
  useEffect(() => {
    if (selectedGroup) setClosed((prev) => (prev.has(selectedGroup) ? new Set([...prev].filter((id) => id !== selectedGroup)) : prev))
  }, [selectedGroup])
  const exterior = data.parts.filter((p) => p.kind === 'exterior')
  const groups = data.systems
    .map((sys) => ({ sys, parts: filter(exterior.filter((p) => p.system === sys.id)) }))
    .filter((g) => g.parts.length)
  const total = groups.reduce((n, g) => n + g.parts.length, 0)
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <>
      <h2 className="side-title">
        {t('parts')} <span className="count">{total}</span>
      </h2>
      {groups.length === 0 && <p className="side-empty">{t('noMatches')}</p>}
      {groups.map(({ sys, parts }) => {
        // A search opens every group, so a match is never hidden inside a folded one.
        const open = searching || !closed.has(sys.id)
        return (
          <section key={sys.id} className="group" style={{ '--c': sys.color } as CSSProperties}>
            <h3>
              <button className="group-title" aria-expanded={open} onClick={() => toggle(sys.id)}>
                <span className="swatch" />
                <bdi>{L(sys.name)}</bdi>
                <span className="count">{parts.length}</span>
                <Icon name="chevronDown" size={14} className="chev" />
              </button>
            </h3>
            {open && (
              <ul className="list">
                {parts.map((p) => (
                  <PartButton key={p.id} id={p.id} label={L(p.name)} onPick={onPick} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}

function SystemsList({ data, onPick }: { data: AircraftData; onPick: () => void }) {
  const t = useT()
  const L = useL()
  const filter = useFilter()
  const active = useStore((s) => s.activeSystem)
  const setActive = useStore((s) => s.setActiveSystem)
  const systems = internalSystems(data)
  const current = systems.find((s) => s.id === active)
  // What the system draws, in drawing order: this is the list the 3D view can actually show.
  const all = current ? drawnPartIds(current).flatMap((id) => data.partsById.get(id) ?? []) : []
  const components = filter(all)

  return (
    <>
      <h2 className="side-title">{t('chooseSystem')}</h2>
      <ul className="list systems">
        {systems.map((s) => (
          <li key={s.id} style={{ '--c': s.color } as CSSProperties}>
            <button className="list-item system-item" aria-pressed={active === s.id} onClick={() => setActive(active === s.id ? null : s.id)}>
              <span className="swatch lg" />
              <bdi>{L(s.name)}</bdi>
            </button>
          </li>
        ))}
      </ul>

      {current?.circuits?.length ? (
        <section className="group">
          <h3 className="group-title static">{t('circuits')}</h3>
          <ul className="legend">
            {current.circuits.map((c) => (
              <li key={c.id} style={{ '--c': c.color } as CSSProperties}>
                <span className="swatch" />
                <bdi>{L(c.name)}</bdi>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {current && (
        <section className="group" style={{ '--c': current.color } as CSSProperties}>
          <h3 className="group-title static">
            {t('components')} <span className="count">{components.length}</span>
          </h3>
          {components.length === 0 && <p className="side-empty">{t('noMatches')}</p>}
          <ul className="list">
            {components.map((p) => (
              <PartButton key={p.id} id={p.id} label={L(p.name)} onPick={onPick} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
