import { setup, run, until, ev, log } from './lib.mjs';
const contact = async (page, max = 3) => { const gt0 = await ev(page, () => __bb.gt); return until(page, 'G.lastContact && G.lastContact.t > ' + gt0, max); };
export default async (page, shot) => {
  await setup(page);
  // 1. exploration with labels + traits + a taunt
  await ev(page, () => { const G = __bb; G.startGame(); G.rus.group.position.set(-0.6, 0, 2.2); G.rus.yaw = Math.PI + 0.35; G.rus.group.rotation.y = G.rus.yaw; G.cam.yaw = G.rus.yaw + Math.PI; G.cam.dist = 4.6; G.cam.pitch = 0.32; });
  await run(page, 1.5);
  await ev(page, () => { __bb.guyDo(0, 'taunt'); __bb.guyDo(4, 'guard'); }); await run(page, 0.4);
  await shot('final_1_explore');
  // 2. perfect strike impact on Макс
  await ev(page, () => { const G = __bb; G.cam.dist = 3.4; G.aiOff = true; G.goTo(2, 0.69); G.guyDo(2, 'windup'); });
  await run(page, 1.6);
  await ev(page, () => { __bb.guyDo(2, 'windup'); }); await run(page, 0.05);
  await ev(page, () => __bb.strike('kick'));
  await contact(page); await run(page, 0.2);
  await shot('final_2_perfect');
  log(await ev(page, () => __bb.info().lastGrade));
  await run(page, 3);
  // 3. block on Стас
  await ev(page, () => { const G = __bb; G.goTo(3, 0.7); G.guyDo(3, 'guard'); });
  await run(page, 1.6); await ev(page, () => __bb.guyDo(3, 'guard')); await run(page, 0.3);
  await ev(page, () => { document.querySelectorAll('.popup').forEach((e) => e.remove()); __bb.strike('kick'); });
  await contact(page); await run(page, 0.15);
  await shot('final_3_block');
  log(await ev(page, () => __bb.info().lastGrade.grade));
  await run(page, 2);
  // 4. coward flees
  await ev(page, () => { const G = __bb; G.aiOff = false; G.goTo(1, 1.3); G.guyDo(1, 'flee'); });
  await run(page, 0.9);
  await shot('final_4_flee');
  await run(page, 2);
};
