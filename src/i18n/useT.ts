import { useStore } from '../store'
import type { LocalText } from '../data/schema'
import { strings, type StringKey } from './strings'

/** UI string lookup for the current language. */
export function useT() {
  const lang = useStore((s) => s.lang)
  return (key: StringKey) => strings[lang][key]
}

/** Picks the current language from a `{ en, ar }` content value. */
export function useL() {
  const lang = useStore((s) => s.lang)
  return (text: LocalText | undefined) => (text ? text[lang] : '')
}
