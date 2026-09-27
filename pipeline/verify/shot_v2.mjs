import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:900,height:900});
p.on('console', m=>console.log('PAGE', m.text())); p.on('pageerror', e=>console.log('ERR', e.message));
await p.goto('http://localhost:38417/verify/index.html'); await p.waitForFunction('window.ready', {timeout:120000});
console.log(JSON.stringify(await p.evaluate('window.info')));
const shots = [
 ['rus_kick_up',0.1667,'idle',0.1667,-70,3.0,'kick_chamber'],['rus_kick_up',0.2667,'flinch',0,-70,3.0,'kick_contact'],['rus_kick_up',0.2667,'flinch',0,-90,2.4,'kick_contact_side'],['rus_kick_up',0.30,'flinch',0.0333,-110,3.0,'kick_hold_front'],
 ['rus_knee',0.30,'clinched',0.30,-70,3.0,'knee_chamber'],['rus_knee',0.40,'flinch_knee',0,-70,3.0,'knee_contact'],['rus_knee',0.50,'flinch_knee',0.1,-90,2.4,'knee_peak_side'],
 ['rus_idle',0,'idle',0,-70,3.4,'state_idle'],['rus_idle',0.2,'flinch',0.2,-70,3.4,'state_flinch'],['rus_idle',0.3,'stun',0.2,-70,3.4,'state_stun'],
 ['rus_idle',0.5,'double_over',1.0,-70,3.4,'state_double_over_end']];
for (const [rc,rt,gc,gt,az,d,n] of shots) { await p.evaluate(`window.pose('${rc}',${rt},'${gc}',${gt},${az},${d})`); await p.screenshot({path:`/workspace/bb3d/renders/v2/three_${n}.png`}); console.log('SHOT', n); }
await b.close();
