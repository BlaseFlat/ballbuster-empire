// Post-process exported GLB: rename clips to final names, add morph-weight (expression) channels + blinks.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [inp, out, animjson, prefix] = process.argv.slice(2);
const anim = JSON.parse(fs.readFileSync(animjson));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); // keep KHR_materials_* from the Blender export
const doc = await io.read(inp);
const root = doc.getRoot(); const buf = root.listBuffers()[0];
const bodyNode = root.listNodes().find(n => n.getMesh() && /_body$/.test(n.getMesh().getName()));
const names = bodyNode.getMesh().getExtras().targetNames;
const FPS = 30;
// zone mask must not be COLOR_0 (three.js would multiply it into base color) -> custom attribute _ZONE (three: geometry.attributes._zone)
for (const m of root.listMeshes()) for (const pr of m.listPrimitives()) {
  const c = pr.getAttribute('COLOR_0'); if (c) { pr.setAttribute('_ZONE', c); pr.setAttribute('COLOR_0', null); console.log('ZONE ->', m.getName()); }
}
const blinkAt = { rus_idle: [18, 50], rus_walk: [20], rus_victory: [60], guy_idle: [14, 40], guy_hurt: [], guy_getup: [26] };
for (const a of root.listAnimations()) {
  const clip = anim[a.getName()];
  if (!clip) { console.log('no data for', a.getName()); continue; }
  const n = clip.n, T = names.length;
  const times = new Float32Array(n), vals = new Float32Array(n * T);
  const blinks = blinkAt[a.getName()] || [];
  for (let f = 0; f < n; f++) {
    times[f] = f / FPS;
    const sh = clip.shapes[f] || {};
    names.forEach((nm, i) => { vals[f * T + i] = Math.max(0, Math.min(1, sh[nm] || 0)); });
    const bi = names.indexOf('blink');
    if (bi >= 0) for (const b of blinks) { const d = Math.abs(f - b); if (d <= 2) vals[f * T + bi] = Math.max(vals[f * T + bi], [1, 0.7, 0.2][d]); }
  }
  const inA = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf);
  const outA = doc.createAccessor().setType('SCALAR').setArray(vals).setBuffer(buf);
  const s = doc.createAnimationSampler().setInput(inA).setOutput(outA).setInterpolation('LINEAR');
  const ch = doc.createAnimationChannel().setTargetNode(bodyNode).setTargetPath('weights').setSampler(s);
  a.addSampler(s).addChannel(ch);
  const final = prefix && a.getName().startsWith(prefix) ? a.getName().slice(prefix.length) : a.getName();
  a.setName(final);
  const dur = (n - 1) / FPS;
  a.setExtras({ loop: !!clip.loop, fps: FPS, frames: n, duration: +dur.toFixed(4) });
  console.log('CLIP', final, dur.toFixed(3) + 's', clip.loop ? 'loop' : 'once');
}
await io.write(out, doc);
