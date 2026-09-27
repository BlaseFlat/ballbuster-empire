// Frame-stepped demo capture: G.manual + G.step(1/30) per frame, CSS animations stepped by hand,
// sound events logged in game time → mixed offline (mix_demo.py) and muxed with ffmpeg.
import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'http://localhost:8123/';
const OUT = process.argv[3] || '/workspace/tmp_inspect/cap';
const MAXF = +(process.argv[4] || 1000);
const fs = await import('fs'); fs.rmSync(OUT + '/frames', { recursive: true, force: true }); fs.mkdirSync(OUT + '/frames', { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (/warn|error/i.test(m.type())) console.log(t); });
page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
await page.goto(URL + '?nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__bb && window.__bb.mode === 'menu', { timeout: 240000, polling: 50 });
await page.evaluate(() => { const G = window.__bb; G.lockDPR = true; G.forceClean = true; G.alwaysTalk = true; G.audio.log = []; });
await page.click('#btn-start');
await page.waitForFunction(() => window.__bb.mode === 'explore', { polling: 50 });
const t0 = await page.evaluate(() => {
  const G = window.__bb; G.manual = true;
  const g = G.guys[0], p = g.group.position;
  const d = { x: Math.sin(g.yaw), z: Math.cos(g.yaw) };
  G.rus.group.position.set(p.x + d.x * 3.6, 0, p.z + d.z * 3.6);
  G.rus.yaw = Math.atan2(-d.x, -d.z); G.rus.group.rotation.y = G.rus.yaw; G.cam.yaw = G.rus.yaw + Math.PI + 0.35;
  G.cam.pos.set(G.rus.group.position.x + Math.sin(G.cam.yaw) * 3.2, 1.9, G.rus.group.position.z + Math.cos(G.cam.yaw) * 3.2);
  G.cam.look.set(G.rus.group.position.x, 1.25, G.rus.group.position.z);
  // director: walk in → E → kick, knee, thigh miss, kick, finishing knee → victory
  const plan = [['kick', true], ['knee', true], ['kick', false], ['kick', true], ['knee', true]];
  const D = window.__demo = { ph: 'settle', t: 0, i: 0, readyT: 0, done: false, endAt: 0 };
  const seen = new WeakSet();
  D.step = (dt) => {
    D.t += dt;
    const rus = G.rus, gp = g.group.position;
    if (D.ph === 'settle') { if (D.t > 0.6) { D.ph = 'walk'; } }
    else if (D.ph === 'walk') {
      // steer toward him: camera yaw so that W walks at the guy
      const dx = gp.x - rus.group.position.x, dz = gp.z - rus.group.position.z;
      G.cam.yaw = Math.atan2(-dx, -dz) + 0.0; G.keys.KeyW = true;
      if (Math.hypot(dx, dz) < 1.35) { G.keys.KeyW = false; D.ph = 'stop'; D.t = 0; }
    } else if (D.ph === 'stop') { if (D.t > 0.7) { G.enterFight(g); D.ph = 'fight'; D.t = 0; D.readyT = 0; } }
    else if (D.ph === 'fight') {
      const f = G.fight; if (!f) return;
      const ready = /hurt|idle/.test(g.currentName) && !g.timeline.length && !g.queue.length && !f.attack && !f.stepping && f.snapT >= 1;
      D.readyT = ready ? D.readyT + dt : 0;
      const need = D.i === 0 ? 1.3 : 0.55;
      if (D.i < plan.length && D.readyT >= need) { const [m, c] = plan[D.i++]; G.forceClean = c; G.attack(m); D.readyT = 0; }
      if (G.mode === 'victory') { D.ph = 'victory'; D.t = 0; }
    } else if (D.ph === 'victory') { if (D.t > 3.4) D.done = true; }
  };
  D.anim = () => {   // step CSS animations with game time
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { seen.add(a); a.pause(); a.currentTime = 0; continue; }
      const end = a.effect && a.effect.getComputedTiming().endTime;
      const nt = (a.currentTime || 0) + 1000 / 30;
      if (end && isFinite(end) && nt >= end) a.finish(); else a.currentTime = nt;
    }
  };
  return G.realTime;
});
let n = 0;
for (; n < MAXF; n++) {
  const done = await page.evaluate(() => { const D = window.__demo; D.step(1 / 30); window.__bb.step(1 / 30); D.anim(); return D.done; });
  await page.screenshot({ path: `${OUT}/frames/f${String(n).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  if (n % 60 === 0) console.log('frame', n, JSON.stringify(await page.evaluate(() => ({ ph: window.__demo.ph, mode: window.__bb.mode, st: window.__bb.fight && window.__bb.fight.bout.guyState, clip: window.__bb.guys[0].currentName }))));
  if (done) { n++; break; }
}
const alog = await page.evaluate(() => window.__bb.audio.log);
fs.writeFileSync(`${OUT}/audio_log.json`, JSON.stringify({ t0, fps: 30, frames: n, events: alog }));
fs.writeFileSync(`${OUT}/console.log`, logs.join('\n'));
console.log('frames', n, 't0', t0, 'events', alog.length, 'warn/err', logs.filter((l) => /^\[(warn|error)|PAGEERROR/.test(l)).length);
await browser.close();
