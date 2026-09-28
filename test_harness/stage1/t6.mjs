import { setup, run, until, ev, log } from './lib.mjs';
export default async (page, shot) => {
  await setup(page);
  const r = await ev(page, () => {
    const G = __bb; G.startGame(); G.aiOff = true;
    const g = G.guys[0]; g.group.position.set(-5, 0, -7.55); g.home.copy(g.group.position); g.yaw = 0; g.group.rotation.y = 0;
    G.goTo(0); G.forceGrade = 'clean'; G.setPain(0, 25);
    const V = g.group.position.constructor; const pv = new V();
    const tr = []; let maxJump = 0, prev = null;
    G.strike('kick');
    for (let i = 0; i < 30 * 4; i++) { G.step(1 / 30); g.boneWorld('pelvis', pv); if (prev) { const j = Math.hypot(pv.x - prev.x, pv.z - prev.z); if (j > maxJump) maxJump = j; tr.push(+j.toFixed(3)); } prev = pv.clone(); }
    G.forceGrade = undefined;
    return { pos: g.group.position.toArray().map((v) => +v.toFixed(3)), maxJump, bounds: G.gym.bounds, tr: tr.join(' ') };
  });
  log(r);
};
