import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 640, height: 360 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8123/');
await page.waitForFunction(() => window.__bb && window.__bb.mode === 'menu', { timeout: 180000 });
await page.evaluate(() => { const G = window.__bb; G.startGame(); G.goTo(0); G.enterFight(G.guys[0]); });
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 700));
  console.log(JSON.stringify(await page.evaluate(() => { const G = window.__bb, f = G.fight; return { mode: G.mode, snapT: f.snapT, dist: f.dist, ts: G.timeScale, hs: G.hitStopUntil, rt: G.realTime, rus: G.rus.group.position.toArray(), from: f.rusFrom.toArray(), dir: f.dir.toArray() }; })));
}
await browser.close();
