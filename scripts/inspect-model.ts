/**
 * Lists what is inside a downloaded .glb, to decide how much of the mapping
 * can use mesh names and how much needs volumes.
 *
 *   npm run inspect-model -- assets-src/some-model.glb
 */
import { readFileSync, statSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('usage: npm run inspect-model -- <file.glb>')
  process.exit(1)
}
const buf = readFileSync(file)
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error('Not a binary glTF (.glb) file. Export or convert to .glb first.')
  process.exit(1)
}
const gltf = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
const accessors = gltf.accessors ?? []

let totalTris = 0
const meshes = (gltf.meshes ?? []).map((m: { name?: string; primitives: { indices?: number; attributes: { POSITION: number }; material?: number }[] }, i: number) => {
  let tris = 0
  for (const p of m.primitives) tris += (p.indices !== undefined ? accessors[p.indices].count : accessors[p.attributes.POSITION].count) / 3
  totalTris += tris
  return { i, name: m.name ?? '', tris, prims: m.primitives.length }
})

const usedBy = new Map<number, string[]>()
for (const n of gltf.nodes ?? []) if (n.mesh !== undefined) usedBy.set(n.mesh, [...(usedBy.get(n.mesh) ?? []), n.name ?? '(unnamed node)'])

console.log(`${file}  ${(statSync(file).size / 1e6).toFixed(1)} MB`)
console.log(`nodes ${gltf.nodes?.length ?? 0}, meshes ${meshes.length}, materials ${gltf.materials?.length ?? 0}, textures ${gltf.textures?.length ?? 0}, triangles ${Math.round(totalTris).toLocaleString()}`)
console.log(`extensions: ${(gltf.extensionsUsed ?? []).join(', ') || 'none'}\n`)
console.log('triangles  prims  mesh name  <-  node names')
for (const m of meshes.sort((a: { tris: number }, b: { tris: number }) => b.tris - a.tris))
  console.log(`${String(Math.round(m.tris)).padStart(9)}  ${String(m.prims).padStart(5)}  ${m.name || '(unnamed)'}  <-  ${(usedBy.get(m.i) ?? []).join(', ')}`)
