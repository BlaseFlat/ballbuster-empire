import puppeteer from 'puppeteer-core';
const OUT = '/workspace/ballbuster-3d-shots/local';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log(m.text()); });
await page.goto('http://localhost:8123/');
await page.waitForFunction(() => window.__bb && window.__bb.mode === 'menu', { timeout: 180000 });
await page.evaluate(() => { const G = window.__bb; G.lockDPR = true; G.startGame(); G.goTo(0); G.enterFight(G.guys[0]); });
await page.waitForFunction(() => window.__bb.fight.snapT >= 1, { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [clip, t, name] of [['rus_kick_up', 0.5, 'p_kick_050'], ['rus_kick_up', 0.4, 'p_kick_040'], ['rus_knee', 0.4, 'p_knee_040'], ['rus_knee', 0.5, 'p_knee_050']]) {
  const r = await page.evaluate((clip, t) => {
    const G = window.__bb; G.hitStopUntil = 1e9; // freeze
    const a = G.rus.play(clip, { fade: 0, loop: false }); a.time = t; G.rus.mixer.update(0);
    const g = G.guys[0]; g.play('guy_idle', { fade: 0 }).time = 0; g.mixer.update(0);
    const v = (b, ch) => ch.boneWorld(b).toArray().map((x) => +x.toFixed(3));
    return { foot: v('foot_r', G.rus), ball: v('ball_r', G.rus), calf: v('calf_r', G.rus), guyPelvis: v('pelvis', g), thighL: v('thigh_l', g), thighR: v('thigh_r', g), rusPos: G.rus.group.position.toArray().map((x) => +x.toFixed(3)), guyPos: g.group.position.toArray().map((x) => +x.toFixed(3)) };
  }, clip, t);
  console.log(name, JSON.stringify(r));
  await page.evaluate(() => new Promise((r) => { const t = window.__bb.realTime; const iv = setInterval(() => { if (window.__bb.realTime > t + 0.6) { clearInterval(iv); r(); } }, 50); }));
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
await browser.close();
