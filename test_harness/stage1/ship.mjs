import { setup, run, until, ev, log } from './lib.mjs';
const cam = (page, p, l) => ev(page, ([p, l]) => { __bb.cam.pos.set(...p); __bb.cam.look.set(...l); }, [p, l]);
export default async (page, shot) => {
  await page.setViewport({ width: 1600, height: 900 });
  await setup(page);
  await ev(page, () => { __bb.startGame(); __bb.aiOff = true; });
  log('variants', await ev(page, () => __bb.guys.map((g) => g.def.name + ':' + g.variant)));
  await run(page, 0.5);
  // 1) Rusana close-up
  await ev(page, () => { const r = __bb.rus; r.group.position.set(-1.5, 0, 2.2); r.yaw = 0.5; r.group.rotation.y = r.yaw; });
  await run(page, 0.3);
  await ev(page, () => { const r = __bb.rus.group.position, y = __bb.rus.yaw; __bb.cam.pos.set(r.x + Math.sin(y) * 1.25 + 0.35, 1.5, r.z + Math.cos(y) * 1.25); __bb.cam.look.set(r.x, 1.3, r.z); });
  await shot('ship_1_rusana');
  // 3) gym with several different guys (line-up of all five, Rusana in front)
  await ev(page, () => { const xs = [-2.4, -1.2, 0, 1.2, 2.4], zs = [-0.6, 0.1, -0.3, 0.2, -0.5];
    __bb.guys.forEach((g, i) => { g.group.position.set(xs[i] - 0.5, 0, zs[i] - 1.5); g.yaw = 0.15 * (2 - i) ; g.group.rotation.y = g.yaw; });
    const r = __bb.rus; r.group.position.set(-0.9, 0, 1.9); r.yaw = Math.PI - 0.35; r.group.rotation.y = r.yaw; });
  await run(page, 0.4);
  await cam(page, [0.4, 1.75, 4.6], [-0.5, 1.0, -1.2]);
  await shot('ship_3_gym');
  await ev(page, () => { __bb.guys.forEach((g) => { g.group.position.copy(g.home); g.yaw = g.def.rot; g.group.rotation.y = g.yaw; }); });
  await run(page, 0.3);
  // 2) strike on a variant guy (Макс = guy_c): measure frames to contact, then redo and shoot just before it
  await ev(page, () => { __bb.goTo(2); }); await run(page, 0.3);
  await ev(page, () => __bb.strike('kick'));
  const gt0 = await ev(page, () => __bb.gt);
  const r1 = await until(page, 'G.lastContact && G.lastContact.t > ' + gt0, 3);
  log('first', r1, await ev(page, () => __bb.info().lastGrade.grade));
  await run(page, 4);
  await ev(page, () => { __bb.guys[2].pain.value = 0; __bb.goTo(2); }); await run(page, 0.4);
  await ev(page, () => __bb.strike('kick'));
  await run(page, Math.max(0, r1.t - 2 / 30));
  const setCam = () => ev(page, () => { const g = __bb.guys[2].group.position, r = __bb.rus.group.position; const mx = (g.x + r.x) / 2, mz = (g.z + r.z) / 2, dx = g.x - r.x, dz = g.z - r.z, l = Math.hypot(dx, dz);
    __bb.cam.pos.set(mx - dz / l * 2.2 - dx / l * 0.6, 1.2, mz + dx / l * 2.2 - dz / l * 0.6); __bb.cam.look.set(mx, 0.85, mz); });
  await setCam(); await shot('ship_2_strike');
  await run(page, 0.5); await setCam(); await shot('ship_2b_after');
};
