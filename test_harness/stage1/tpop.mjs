import { setup, run, until, ev, log } from './lib.mjs';
const n = (page) => ev(page, () => [...document.querySelectorAll('#popups .popup')].map((e) => e.textContent + '@' + (+e.style.opacity).toFixed(2)));
export default async (page, shot) => {
  await setup(page);
  await ev(page, () => { __bb.startGame(); __bb.aiOff = true; });
  await ev(page, () => { __bb.goTo(2); __bb.guyDo(2, 'catch'); }); await run(page, 0.3);
  await ev(page, () => __bb.strike('kick'));
  await until(page, 'document.querySelectorAll("#popups .popup").length > 0', 3);
  for (const t of [0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]) { await run(page, t); log(await n(page)); }
  await ev(page, () => { for (let i = 0; i < 3; i++) __bb.fx.popup('Поймал ногу!', { x: 300, y: 300 }, 'block'); }); log('dup', await n(page));
  await run(page, 1.1); log('end', await n(page));
};
