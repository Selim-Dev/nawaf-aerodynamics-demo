/**
 * Shrinks a downloaded model for the web WITHOUT merging or renaming meshes,
 * because mapping.json refers to mesh names.
 *
 *   npm run optimize-model -- assets-src/source.glb public/aircraft/a320/model.glb [--ratio 0.5]
 *
 * Steps: dedupe, prune, weld, optional simplify, WebP textures at most 2048 px,
 * meshopt compression (decoder ships with the app; no CDN needed).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [input, output] = process.argv.slice(2)
const ratioArg = process.argv.indexOf('--ratio')
const ratio = ratioArg > 0 ? process.argv[ratioArg + 1] : undefined
if (!input || !output) {
  console.error('usage: npm run optimize-model -- <in.glb> <out.glb> [--ratio 0.5]')
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'gltf-'))
const step = (n: number) => join(tmp, `step${n}.glb`)
const run = (...args: string[]) => {
  console.log('> gltf-transform', args.join(' '))
  execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.1', ...args], { stdio: 'inherit', shell: true })
}

try {
  let cur = input
  let n = 0
  const next = (...args: string[]) => {
    const out = step(++n)
    run(args[0], cur, out, ...args.slice(1))
    cur = out
  }
  next('dedup')
  next('prune')
  next('weld')
  if (ratio) next('simplify', '--ratio', ratio, '--error', '0.001')
  next('resize', '--width', '2048', '--height', '2048')
  next('webp')
  run('meshopt', cur, output)
  run('inspect', output)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
