import { state, NPCS, isDefeated } from './state.js';
import { drawCampusBg, drawRusanaTop, drawGuyTop } from './sprites.js';

const SPEED = 180;
const INTERACT_R = 55;

export function createCampus(canvas, onInteractHint) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const player = { x: 200, y: 300, facing: 'right', walking: false };
  let last = performance.now();
  let running = false;
  let raf = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function update(dt) {
    let dx = 0, dy = 0;
    const k = state.keys;
    if (k['KeyW'] || k['ArrowUp']) dy -= 1;
    if (k['KeyS'] || k['ArrowDown']) dy += 1;
    if (k['KeyA'] || k['ArrowLeft']) dx -= 1;
    if (k['KeyD'] || k['ArrowRight']) dx += 1;
    player.walking = dx !== 0 || dy !== 0;
    if (player.walking) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      player.x = clamp(player.x + dx * SPEED * dt, 30, W - 30);
      player.y = clamp(player.y + dy * SPEED * dt, 40, H - 30);
      if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
      else player.facing = dy > 0 ? 'down' : 'up';
    }
    let nearest = null, best = INTERACT_R;
    for (const npc of NPCS) {
      if (isDefeated(npc.id)) continue;
      const d = Math.hypot(npc.x - player.x, npc.y - player.y);
      if (d < best) { best = d; nearest = npc; }
    }
    state.nearestNpc = nearest;
    onInteractHint(!!nearest);
  }

  function draw(t) {
    drawCampusBg(ctx, W, H);
    const entities = [
      ...NPCS.map((n) => ({ type: 'npc', n, y: n.y })),
      { type: 'player', y: player.y },
    ].sort((a, b) => a.y - b.y);
    for (const e of entities) {
      if (e.type === 'player') drawRusanaTop(ctx, player.x, player.y, player.facing, player.walking, t);
      else drawGuyTop(ctx, e.n.x, e.n.y, e.n, isDefeated(e.n.id), t);
    }
    if (state.nearestNpc) {
      const n = state.nearestNpc;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(n.x, n.y, INTERACT_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw(now / 1000);
    raf = requestAnimationFrame(loop);
  }

  return {
    start() { running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    tryInteract() { return state.nearestNpc; },
    resetPlayer() { player.x = 200; player.y = 300; },
  };
}
