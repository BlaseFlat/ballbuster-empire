import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'http://localhost:8123/';
const OUT = process.argv[3] || '/workspace/ballbuster-3d-shots/local';
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const fs = await import('fs'); fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (!/GPU stall|WebGL-|JSHandle/.test(t)) console.log(t); });
page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message); });
page.on('requestfailed', (r) => console.log('REQFAIL', r.url()));
page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
const info = async () => JSON.stringify(await page.evaluate(() => { const i = window.__bb.info(); delete i.assets; delete i.contact; return i; }));
// wait for N seconds of *game* real-time (headless swiftshader runs at a few fps)
const waitGame = (s) => page.evaluate((s) => new Promise((r) => { const t0 = window.__bb.realTime; const iv = setInterval(() => { if (window.__bb.realTime >= t0 + s) { clearInterval(iv); r(); } }, 30); }), s);
const waitFor = (fn, t = 180000) => page.waitForFunction(fn, { timeout: t, polling: 50 });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1200); await shot('00_loading');
await waitFor(() => window.__bb && window.__bb.mode === 'menu');
await page.evaluate(() => { window.__bb.lockDPR = true; });
console.log('assets', JSON.stringify(await page.evaluate(() => ({ a: window.__bb.assetsInfo, c: window.__bb.contact }))));
await waitGame(2); await shot('01_menu');
await page.click('#btn-start');
await waitGame(1.5); await shot('02_explore_start');
await page.keyboard.down('KeyW'); await waitGame(1.6); await shot('03_walking'); await waitGame(0.6); await page.keyboard.up('KeyW');
await page.keyboard.down('KeyD'); await waitGame(1.0); await shot('03b_walking_turn'); await page.keyboard.up('KeyD');
await waitGame(0.8); await shot('04_explore');
await page.evaluate(() => window.__bb.goTo(0)); await waitGame(1.0); await shot('05_near_prompt');
console.log(await info());
await page.keyboard.press('KeyE'); await waitFor(() => window.__bb.fight && window.__bb.fight.snapT >= 1); await waitGame(1.2); await shot('06_fight');
console.log('render', JSON.stringify(await page.evaluate(() => { const r = window.__bb.renderInfo; return r; })));
const attackAndShoot = async (key, name) => {
  await page.keyboard.press(key);
  await waitFor(() => { const f = window.__bb.fight; return !f || f.ended || (f.attack && f.attack.contactDone); });
  await shot(name);
  await waitFor(() => { const f = window.__bb.fight; return !f || f.ended || !f.attack; });
};
await attackAndShoot('KeyJ', '07_kick_contact'); await waitGame(0.3); await shot('08_after_kick');
await attackAndShoot('KeyK', '09_knee_contact'); await waitGame(0.3); await shot('10_after_knee');
console.log(await info());
for (let i = 0; i < 14; i++) {
  const st = await page.evaluate(() => ({ m: window.__bb.mode, e: window.__bb.fight && window.__bb.fight.ended }));
  if (st.m !== 'fight' || st.e) break;
  await attackAndShoot(i % 2 ? 'KeyK' : 'KeyJ', `11_hit_${String(i).padStart(2, '0')}`);
}
await waitFor(() => window.__bb.mode === 'victory'); await waitGame(1.6); await shot('12_victory');
console.log(await info());
await page.keyboard.press('KeyE'); await waitFor(() => window.__bb.mode === 'explore'); await waitGame(1.5); await shot('13_back_explore');
await page.evaluate(() => { const G = window.__bb; G.cam.yaw += 2.4; }); await waitGame(1.5); await shot('14_beaten_guy_on_floor');
console.log(await info());
fs.writeFileSync(`${OUT}/console.log`, logs.join('\n'));
await browser.close();
