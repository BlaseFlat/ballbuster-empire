import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 800, height: 450 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8123/');
await page.waitForFunction(() => window.__bb && window.__bb.mode === 'menu', { timeout: 180000 });
const r = await page.evaluate(async () => {
  const G = window.__bb; const out = {};
  const f = (v) => v.toArray().map((x) => +x.toFixed(3));
  const THREE = await import('three');
  for (const ch of [G.rus, G.guys[0]]) {
    const v = new THREE.Vector3();
    const b = new THREE.Box3().setFromObject(ch.group);
    out[ch.name] = { group: f(ch.group.position), yaw: ch.yaw, pelvis: f(ch.boneWorld('pelvis', v)), root: ch.bones.Root ? f(ch.boneWorld('Root', new THREE.Vector3())) : null, bbox: [f(b.min), f(b.max)], head: ch.bones.head ? f(ch.boneWorld('head', new THREE.Vector3())) : null, modelPos: f(ch.model.position), modelRot: f(ch.model.rotation.toVector3 ? ch.model.rotation.toVector3() : new THREE.Vector3(ch.model.rotation.x, ch.model.rotation.y, ch.model.rotation.z)), modelScale: f(ch.model.scale), children: ch.model.children.map((c) => c.name + ':' + c.type + ':' + f(c.position) + ':' + f(c.scale)) };
  }
  out.bones = Object.keys(G.rus.bones);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
