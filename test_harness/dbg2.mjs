import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 800, height: 450 });
await page.goto('http://localhost:8123/');
await page.waitForFunction(() => window.__bb && window.__bb.mode === 'menu', { timeout: 180000 });
const r = await page.evaluate(() => {
  const G = window.__bb; const out = [];
  for (const ch of [G.rus, G.guys[0]]) ch.model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material; const c = o.geometry.attributes.color;
    let st = null;
    if (c) { let mn = [9,9,9], mx = [-9,-9,-9], s=[0,0,0]; for (let i = 0; i < c.count; i++) for (let k = 0; k < 3; k++) { const v = c.getComponent(i, k); mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); s[k]+=v; } st = { mn, mx, mean: s.map(x=>+(x/c.count).toFixed(3)), itemSize: c.itemSize, norm: c.normalized }; }
    out.push({ ch: ch.name, mesh: o.name, mat: m.name, type: m.type, vc: m.vertexColors, color: m.color && m.color.getHexString(), map: !!m.map, rough: m.roughness, metal: m.metalness, st, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side, morph: o.morphTargetInfluences && o.morphTargetInfluences.length });
  });
  return out;
});
for (const x of r) console.log(JSON.stringify(x));
await browser.close();
