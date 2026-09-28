// usage: node verify/shots_v3.mjs shots.json outdir   (pipeline dir served on :38418)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [spec, outdir] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(spec));
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:480,height:560});
p.on('pageerror', e=>console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('PAGE', m.text()); });
await p.goto('http://localhost:38418/verify/anim.html'); await p.waitForFunction('window.ready', {timeout:120000});
const out = {};
for (const s of shots) { const info = await p.evaluate((o) => window.show(o), s); out[s.name] = info; await p.screenshot({path:`${outdir}/${s.name}.png`}); }
fs.writeFileSync(`${outdir}/info.json`, JSON.stringify(out, null, 1));
console.log('shots', shots.length);
await b.close();
