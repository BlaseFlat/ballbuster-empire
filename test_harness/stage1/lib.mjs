export const setup = (page) => page.evaluate(() => {
  const G = __bb; G.manual = true; G.lockDPR = true; G.noRender = true;
  window.__run = (sec) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) G.step(1 / 30); return G.info(); };
  window.__until = (fnSrc, max = 5) => { const f = new Function('G', 'return (' + fnSrc + ')'); const n = Math.round(max * 30); for (let i = 0; i < n; i++) { G.step(1 / 30); if (f(G)) return { ok: true, t: i / 30 }; } return { ok: false }; };
});
export const run = (page, sec) => page.evaluate((s) => __run(s), sec);
export const until = (page, src, max) => page.evaluate((s, m) => __until(s, m), src, max);
export const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
export const log = (...a) => console.log('[T]', ...a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)));
