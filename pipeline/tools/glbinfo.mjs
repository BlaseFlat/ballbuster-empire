import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  let verts = 0, tris = 0;
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { verts += p.getAttribute('POSITION').getCount(); tris += (p.getIndices() ? p.getIndices().getCount() : 0) / 3; }
  const skins = r.listSkins().map(s => s.listJoints().length);
  const joints = r.listSkins()[0].listJoints().map(j => j.getName()).sort().join(',');
  const clips = r.listAnimations().map(a => { const e = a.getExtras(); return `${a.getName()}:${e.frames}`; }).join(' ');
  const mats = r.listMaterials().map(m => m.getName() + (m.getNormalTexture() ? '+N' : '') + (m.getExtension('KHR_materials_specular') ? '+S' : '')).join(' ');
  const tex = r.listTextures().map(t => `${t.getName()}:${t.getSize()?.join('x')}:${(t.getImage().byteLength/1024).toFixed(0)}K`).join(' ');
  const morph = r.listMeshes().map(m => m.getExtras().targetNames).find(x => x);
  console.log(JSON.stringify({ file: f, bytes: fs.statSync(f).size, meshes: r.listMeshes().length, verts, tris, skins, jointsHash: joints.length + ':' + joints.slice(0, 40), clips, morph, mats, tex }, null, 0));
}
