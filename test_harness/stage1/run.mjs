import puppeteer from 'puppeteer-core';
const scen = process.argv[2];
const url = process.argv[3] || 'http://localhost:8080/?debug';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /\[T\]/.test(t)) console.log(`[${m.type()}]`, t); if (m.type() === 'error') errs.push(t); });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); errs.push(e.message); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bb && window.__bb.mode === 'menu', { timeout: 120000 });
const shot = async (name) => { await page.evaluate(() => { if (__bb.manual) { __bb.noRender = false; __bb.step(1e-4); __bb.noRender = true; } }); await page.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.classList && t.classList.contains('popup')) { a.pause(); a.currentTime = 230; } } });
  await page.screenshot({ path: `${process.env.SHOTS || '/workspace/bb_shots'}/${name}.png` });
  await page.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.classList && t.classList.contains('popup')) a.play(); } }); console.log('shot', name); };
const mod = await import('./' + scen + '?t=' + Date.now());
try { await mod.default(page, shot); } catch (e) { console.log('SCENARIO ERROR', e); errs.push(String(e)); }
console.log('ERRORS:', errs.length, errs.slice(0, 10));
await browser.close();
