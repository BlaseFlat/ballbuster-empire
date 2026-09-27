import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:900,height:900});
p.on('console', m=>console.log('PAGE', m.text())); p.on('pageerror', e=>console.log('ERR', e.message));
await p.goto('http://localhost:38417/verify/index.html'); await p.waitForFunction('window.ready', {timeout:120000});
console.log(JSON.stringify(await p.evaluate('window.info')));
const shots = [
 ['rus_kick_up',0.5,'flinch',0,-70,3.0,'kick_contact_t0.50'],['rus_kick_up',0.567,'flinch',0.067,-70,3.0,'kick_peak_t0.567'],['rus_kick_up',0.5,'flinch',0,-90,2.4,'kick_contact_side'],
 ['rus_knee',0.4,'flinch',0,-70,3.0,'knee_contact_t0.40'],['rus_knee',0.5,'flinch',0.1,-70,3.0,'knee_peak_t0.50'],['rus_knee',0.4,'flinch',0,-90,2.4,'knee_contact_side'],
 ['rus_idle',0,'idle',0,-70,3.4,'state_idle'],['rus_idle',0.3,'flinch',0.3,-70,3.4,'state_flinch'],['rus_idle',0.5,'double_over',1.0,-70,3.4,'state_double_over'],
 ['rus_idle',0.7,'knees',1.0,-70,3.4,'state_knees'],['rus_victory',1.0,'floor',0.5,-70,3.4,'state_floor'],['rus_victory',2.0,'tap',0.6,-70,3.4,'state_tap'],
 ['rus_walk',0.27,'idle',0,-40,3.4,'rus_walk'],['rus_victory',2.7,'tap',1.1,-35,3.4,'rus_victory']];
for (const [rc,rt,gc,gt,az,d,n] of shots) { await p.evaluate(`window.pose('${rc}',${rt},'${gc}',${gt},${az},${d})`); await p.screenshot({path:`/workspace/bb3d/renders/final/three_${n}.png`}); console.log('SHOT', n); }
await b.close();
