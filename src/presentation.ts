/**
 * Presentation settings: who this demo is being shown to, and the music source.
 * Edit this file before a client meeting, or use the URL options listed in the README.
 */
import type { LocalText } from './data/schema'

const params = new URLSearchParams(window.location.search)

/**
 * The person the demo is presented to. Shown on the opening screen and as a
 * badge in the toolbar. Set to null to remove the dedication everywhere.
 */
const CLIENT: LocalText | null = { en: 'Eng. Nawaf', ar: 'المهندس نواف' }

/**
 * Optional music file under public/ (for example 'audio/ambient.mp3'). When
 * null, the built-in generated ambient music plays: it needs no file, works
 * offline and never repeats.
 */
export const MUSIC_FILE: string | null = null

function clientName(): LocalText | null {
  const q = params.get('for')
  if (q === null) return CLIENT
  const name = q.trim()
  if (!name || name === 'none' || name === '0') return null
  return { en: name, ar: name }
}

export const presentation = {
  /** ?for=Name overrides the name, ?for=none hides it. */
  client: clientName(),
  /** ?intro=0 skips the opening screen; so do the debug and authoring modes. */
  showIntro: params.get('intro') !== '0' && !params.has('debug') && !params.has('author'),
}
