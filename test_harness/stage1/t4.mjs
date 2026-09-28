import { setup, run, until, ev, log } from './lib.mjs';
// "bot player" with AI on: walks up to guy i, strikes when strikeable (sometimes spams), reports outcomes
export default async (page, shot) => {
  await setup(page);
  await ev(page, () => { __bb.startGame(); });
  const idx = +(process.env.GUY || 0);
  const res = await ev(page, (i) => {
    const G = __bb, g = G.guys[i], out = { grades: {}, events: [], t: 0 };
    const S = (k) => { const e = new KeyboardEvent('keydown', { code: k }); dispatchEvent(e); dispatchEvent(new KeyboardEvent('keyup', { code: k })); };
    let lastC = null, spamT = 0, shots = 0;
    for (let f = 0; f < 30 * 90; f++) {
      if (G.mode === 'victory') { out.victory = G.gt; break; }
      const rp = G.rus.group.position, gp = g.group.position;
      const d = Math.hypot(gp.x - rp.x, gp.z - rp.z);
      // steer: face him (camera yaw set so W walks toward him)
      const yaw = Math.atan2(gp.x - rp.x, gp.z - rp.z);
      G.cam.yaw = yaw + Math.PI; G.cam.lastDrag = G.realTime;
      G.keys.KeyW = d > 0.9 && !G.act;
      if (!G.act && d < 1.4 && Math.random() < 0.12) { const mv = Math.random() < 0.6 ? 'KeyJ' : 'KeyK'; S(mv); if (Math.random() < 0.15) { S(mv); S(mv); } }
      G.step(1 / 30);
      if (G.lastContact && G.lastContact !== lastC) { lastC = G.lastContact; const gr = lastC.grade; out.grades[gr] = (out.grades[gr] || 0) + 1; out.events.push([+G.gt.toFixed(1), gr, G.lastGrade.open || '', +g.pain.value.toFixed(0), g.bout && g.bout.guyState]); }
      if (G.act && G.act.type === 'stagger' && (!out.events.length || out.events[out.events.length - 1][1] !== 'STAGGER')) out.events.push([+G.gt.toFixed(1), 'STAGGER']);
    }
    G.keys = {};
    out.t = +G.gt.toFixed(1); out.final = G.info().guys[i];
    return out;
  }, idx);
  log(JSON.stringify(res.grades), 'victory@', res.victory, 't', res.t);
  log(JSON.stringify(res.events));
  log(JSON.stringify(res.final));
};
