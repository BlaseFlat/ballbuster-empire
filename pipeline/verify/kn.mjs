import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:900,height:900});
await p.goto('http://localhost:38417/verify/index.html'); await p.waitForFunction('window.ready', {timeout:120000});
for (const [gt,az,n] of [[1.0,-90,'a'],[1.0,-150,'b'],[0.0,-90,'c'],[0.5,-90,'d']]) { await p.evaluate(`window.pose('rus_idle',0,'knees',${gt},${az},3.0)`); await p.screenshot({path:`/tmp/kn_${n}.png`}); }
await b.close();
