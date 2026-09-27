import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'http://localhost:8123/';
const OUT = process.argv[3] || '/workspace/ballbuster-3d-shots/v2-local';
const fs = await import('fs'); fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (/warn|error|bb\]/i.test(t) && !/GPU stall/.test(t)) console.log(t); });
page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
const waitFor = (fn, arg, t = 240000) => page.waitForFunction(fn, { timeout: t, polling: 20 }, arg);
const waitGame = (s) => page.evaluate((s) => new Promise((r) => { const t0 = window.__bb.realTime; const iv = setInterval(() => { if (window.__bb.realTime >= t0 + s) { clearInterval(iv); r(); } }, 20); }), s);
const freezeShot = async (n) => { await page.evaluate(() => { window.__bb.paused = true; }); await new Promise((r) => setTimeout(r, 400)); await shot(n); await page.evaluate(() => { window.__bb.paused = false; }); };
await page.goto(URL + '?nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
await waitFor(() => window.__bb && window.__bb.mode === 'menu');
console.log('version', await page.evaluate(() => document.querySelector('meta[name=bb-version]').content));
console.log('contact', JSON.stringify(await page.evaluate(() => window.__bb.contact)));
await page.evaluate(() => { const G = window.__bb; G.lockDPR = true; G.forceClean = true;
  G.trace = []; G.onFrame = () => { const g = G.guys[0]; if (!G.fight) return; const p = g.boneWorld('pelvis'); G.trace.push({ t: +G.realTime.toFixed(3), clip: g.currentName, st: !!g.stagger, mz: +g.model.position.z.toFixed(3), px: +p.x.toFixed(3), pz: +p.z.toFixed(3), gx: +g.group.position.x.toFixed(3), gz: +g.group.position.z.toFixed(3) }); }; });
await shot('01_menu');
await page.click('#btn-start'); await waitGame(1.0);
await page.evaluate(() => window.__bb.goTo(0)); await waitGame(1.0); await shot('02_near_prompt');
await page.keyboard.press('KeyE'); await waitFor(() => window.__bb.fight && window.__bb.fight.snapT >= 1); await waitGame(1.0); await shot('03_fight');
// hit 1: kick (contact freeze)
await page.keyboard.press('KeyJ');
await waitFor(() => { const f = window.__bb.fight; return f.attack && window.__bb.rus.time >= f.attack.ci.time - 0.005; }); await freezeShot('04_kick_contact');
await waitFor(() => { const G = window.__bb; return G.fight.attack && G.fight.attack.contactDone && G.guys[0].currentName === 'flinch'; }); await freezeShot('05_kick_flinch');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'hurt' || G.guys[0].currentName === 'guy_hurt'; });
// hit 2: knee → double_over + stagger
await page.keyboard.press('KeyK');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'clinched' && G.rus.time > 0.2; }); await freezeShot('06_knee_clinch');
await waitFor(() => { const f = window.__bb.fight; return f.attack && f.attack.move === 'knee' && window.__bb.rus.time >= f.attack.ci.time - 0.005; }); await freezeShot('07_knee_contact');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'double_over' && G.guys[0].time > 0.5; }); await freezeShot('08_double_over_stagger_mid');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'double_over' && G.guys[0].time > 0.93; }); await freezeShot('09_double_over_end_prebake');
await waitFor(() => !!window.__bb.guys[0].stagger); await freezeShot('10_after_bake');
await waitFor(() => { const G = window.__bb; return !G.guys[0].stagger; }); await freezeShot('11_recovered_hurt_rusana_closed_in');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'hurt' && !G.fight.stepping; });
// hit 3: kick → double_over → knees → getup
await page.keyboard.press('KeyJ');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'knees' && G.guys[0].time > 0.8; }); await freezeShot('12_knees');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'getup' && G.guys[0].time > 0.5; }); await freezeShot('13_getup');
await waitFor(() => { const G = window.__bb; return G.guys[0].currentName === 'hurt' && !G.fight.stepping && !G.guys[0].queue.length; });
// hit 4: knee → floor (finishing, slow-mo) → tap → victory
await page.keyboard.press('KeyK');
await waitFor(() => { const f = window.__bb.fight; return f.attack && f.attack.contactDone; }); await freezeShot('14_finishing_knee_contact');
await waitFor(() => window.__bb.guys[0].currentName === 'floor'); await waitGame(0.3); await freezeShot('15_floor');
await waitFor(() => window.__bb.guys[0].currentName === 'tap'); await waitGame(0.4); await freezeShot('16_tap');
await waitFor(() => window.__bb.mode === 'victory'); await waitGame(1.8); await shot('17_victory');
console.log(JSON.stringify(await page.evaluate(() => { const i = window.__bb.info(); delete i.assets; delete i.contact; return i; })));
await page.keyboard.press('KeyE'); await waitFor(() => window.__bb.mode === 'explore'); await waitGame(1.2); await shot('18_back_explore_beaten_on_floor');
const trace = await page.evaluate(() => window.__bb.trace);
fs.writeFileSync(`${OUT}/pelvis_trace.json`, JSON.stringify(trace));
// pop analysis: per-frame pelvis horizontal jump
let worst = [];
for (let i = 1; i < trace.length; i++) { const a = trace[i - 1], b = trace[i]; const d = Math.hypot(b.px - a.px, b.pz - a.pz); worst.push({ d: +d.toFixed(3), i, from: a.clip, to: b.clip, st: b.st, dt: +(b.t - a.t).toFixed(3) }); }
worst.sort((x, y) => y.d - x.d); console.log('max per-frame pelvis jumps', JSON.stringify(worst.slice(0, 6)));
const bi = trace.findIndex((x) => x.st); console.log('around bake', JSON.stringify(trace.slice(Math.max(0, bi - 3), bi + 4)));
fs.writeFileSync(`${OUT}/console.log`, logs.join('\n'));
await browser.close();
