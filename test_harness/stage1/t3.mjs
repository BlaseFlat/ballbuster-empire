import { setup, run, until, ev, log } from './lib.mjs';
const contact = async (page, max = 3) => { const gt0 = await ev(page, () => __bb.gt); const r = await until(page, 'G.lastContact && G.lastContact.t > ' + gt0, max); const lg = await ev(page, () => __bb.info().lastGrade); return { r, lg }; };
export default async (page, shot) => {
  await setup(page);
  await ev(page, () => { __bb.startGame(); __bb.aiOff = true; });
  // a) block
  await ev(page, () => { __bb.goTo(0); __bb.guyDo(0, 'guard'); }); await run(page, 0.6);
  await ev(page, () => __bb.strike('kick'));
  let c = await contact(page); log('block?', c.lg.grade, c.lg.guard);
  await run(page, 0.15); await shot('t3_block');
  await run(page, 1.5);
  // b) catch
  await ev(page, () => { __bb.goTo(2); __bb.guyDo(2, 'catch'); }); await run(page, 0.3);
  await ev(page, () => __bb.strike('kick'));
  c = await contact(page); log('caught?', c.lg.grade);
  await run(page, 0.25); await shot('t3_caught');
  await run(page, 0.5); log('act after catch', await ev(page, () => __bb.info().act));
  await run(page, 1.5);
  // c) shove (angry Макс) — AI on for him
  await ev(page, () => { __bb.aiOff = false; __bb.goTo(2, 0.9); __bb.guyDo(2, 'windup'); }); await run(page, 0.3);
  await shot('t3_windup');
  await run(page, 0.4); log('act after shove', await ev(page, () => __bb.info().act));
  await shot('t3_shove');
  await run(page, 1.0);
  // e) counter into windup = opening
  await ev(page, () => { __bb.aiOff = true; __bb.goTo(2); __bb.guyDo(2, 'windup'); }); await run(page, 0.1);
  await ev(page, () => __bb.strike('kick'));
  c = await contact(page); log('counter windup', c.lg.grade, c.lg.open, c.lg.score);
  await run(page, 0.2); await shot('t3_counter');
  await run(page, 3);
  // f) dash from 1.8 m (Стас)
  await ev(page, () => { __bb.goTo(3, 1.8); }); await run(page, 0.2);
  await ev(page, () => __bb.strike('kick'));
  await run(page, 0.15); log('dash act', await ev(page, () => __bb.info().act));
  c = await contact(page); log('dash strike', c.lg.grade, c.lg.distErr, c.lg.score, c.lg.timing);
  await run(page, 3);
  // g) turned hip
  await ev(page, () => { __bb.goTo(4); __bb.guyDo(4, 'turn'); }); await run(page, 0.5);
  log('turned angle', await ev(page, () => __bb.info().guys[4].angle));
  await ev(page, () => __bb.strike('kick'));
  c = await contact(page); log('turned strike', c.lg.grade, c.lg.angleDeg);
  await run(page, 2);
  // d) flee (Артём)
  await ev(page, () => { __bb.goTo(1, 1.2); __bb.aiOff = false; __bb.guyDo(1, 'flee'); }); await run(page, 0.7);
  const p0 = await ev(page, () => __bb.info().guys[1]);
  await ev(page, () => { const g = __bb.guys[1], r = __bb.rus.group.position; __bb.cam.pos.set(g.group.position.x + 2.2, 1.4, g.group.position.z + 2.2); });
  await shot('t3_flee');
  await run(page, 2.5); const p1 = await ev(page, () => __bb.info().guys[1]);
  log('flee', p0.ai, p0.dist, '→', p1.ai, p1.dist);
};
