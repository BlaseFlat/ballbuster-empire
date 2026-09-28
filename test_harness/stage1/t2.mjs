import { setup, run, until, ev, log } from './lib.mjs';
export default async (page, shot) => {
  await setup(page);
  await ev(page, () => { __bb.startGame(); __bb.aiOff = true; __bb.goTo(0); });
  await run(page, 1);
  for (let i = 0; i < 14; i++) {
    let inf = await ev(page, () => __bb.info());
    if (inf.mode === 'victory' || inf.guys[0].state === 'floor') break;
    await until(page, "G.info().guys[0].strikeable", 6);
    inf = await ev(page, () => __bb.info());
    const g = inf.guys[0];
    const mv = g.strikeable === 'bent' ? 'knee' : (i % 2 ? 'knee' : 'kick');
    const gt0 = await ev(page, () => __bb.gt);
    await ev(page, (m) => __bb.strike(m), mv);
    const r = await until(page, "G.lastContact && G.lastContact.t > " + gt0, 3);
    const lg = await ev(page, () => __bb.info().lastGrade);
    log(i, mv, g.strikeable, g.clip, 'eff', g.eff, 'ok', r.ok, r.t, '→', lg && lg.grade, 'pain', lg && lg.pain, lg && lg.next, 'distErr', lg && lg.distErr);
    if (i === 1) await shot('t2_hit');
    await run(page, 0.3);
  }
  const r = await until(page, "G.mode==='victory'", 8);
  await run(page, 2.5);
  const inf = await ev(page, () => __bb.info());
  log('end', r, inf.mode, inf.rep, inf.guys[0]);
  await ev(page, () => document.querySelectorAll('.popup').forEach((e) => e.remove())); await shot('final_5_victory');
  await ev(page, () => __bb.continueAfterVictory()); await run(page, 1.5);
  await shot('t2_after');
  log('after', await ev(page, () => { const i = __bb.info(); return [i.mode, i.guys[0].beaten, document.querySelector('.npc-label.beaten')?.textContent]; }));
};
