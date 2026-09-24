/** Canvas sprite helpers — readable shapes for Phase 1 */

export function drawCampusBg(ctx, w, h) {
  // Ground
  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, 0, w, h);

  // Paths
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(0, h * 0.42, w, 70);
  ctx.fillRect(w * 0.35, 0, 70, h);

  // Buildings (simple blocks)
  const buildings = [
    { x: 40, y: 40, w: 180, h: 140, label: 'Библиотека' },
    { x: 280, y: 30, w: 160, h: 120, label: 'Корпус А' },
    { x: 700, y: 50, w: 200, h: 130, label: 'Общага' },
    { x: 40, y: 380, w: 200, h: 120, label: 'Столовая' },
  ];
  for (const b of buildings) {
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#3a3a55';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // Windows
    ctx.fillStyle = '#fbbf2444';
    for (let wx = b.x + 16; wx < b.x + b.w - 20; wx += 28) {
      for (let wy = b.y + 20; wy < b.y + b.h - 30; wy += 28) {
        ctx.fillRect(wx, wy, 14, 14);
      }
    }
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.fillText(b.label, b.x + 10, b.y + b.h - 10);
  }

  // Grass patches
  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.ellipse(500, 200, 90, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(880, 300, 60, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Title strip
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, w, 28);
  ctx.fillStyle = '#fb7185';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Кампус · зона обучения Hit / стейтам', 12, 18);
}

/** Top-down Rusana */
export function drawRusanaTop(ctx, x, y, facing, walking, t) {
  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = walking ? Math.sin(t * 12) * 1.5 : 0;

  // Legs
  ctx.fillStyle = '#1a1a1a';
  const legSwing = walking ? Math.sin(t * 12) * 4 : 0;
  ctx.fillRect(-8, 4 + bob, 6, 12 + legSwing * 0.3);
  ctx.fillRect(2, 4 + bob, 6, 12 - legSwing * 0.3);

  // Body — burgundy crop
  ctx.fillStyle = '#9f1239';
  ctx.fillRect(-11, -16 + bob, 22, 22);

  // Hips / shorts
  ctx.fillStyle = '#171717';
  ctx.fillRect(-12, 2 + bob, 24, 10);

  // Head
  ctx.fillStyle = '#e8b896';
  ctx.beginPath();
  ctx.arc(0, -24 + bob, 10, 0, Math.PI * 2);
  ctx.fill();

  // Hair ponytail
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(0, -28 + bob, 9, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(6, -30 + bob, 5, 16);

  // Eyes (cold)
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(-5, -26 + bob, 3, 2);
  ctx.fillRect(2, -26 + bob, 3, 2);

  // Facing indicator
  ctx.fillStyle = '#fb7185';
  const fx = facing === 'left' ? -14 : facing === 'right' ? 14 : 0;
  const fy = facing === 'up' ? -36 : facing === 'down' ? 18 : -10;
  if (facing === 'left' || facing === 'right') {
    ctx.beginPath();
    ctx.moveTo(fx, -10 + bob);
    ctx.lineTo(fx + (facing === 'right' ? 6 : -6), -7 + bob);
    ctx.lineTo(fx, -4 + bob);
    ctx.fill();
  }

  ctx.restore();
}

/** Top-down male NPC */
export function drawGuyTop(ctx, x, y, npc, defeated, t) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (defeated) {
    // Floor / crumpled
    ctx.fillStyle = npc.color;
    ctx.fillRect(-18, 0, 28, 12);
    ctx.fillStyle = '#e8b896';
    ctx.beginPath();
    ctx.arc(-10, 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = npc.hair;
    ctx.beginPath();
    ctx.arc(-10, 2, 7, Math.PI, 0);
    ctx.fill();
    // Hands on crotch
    ctx.fillStyle = '#e8b896';
    ctx.fillRect(2, 2, 8, 6);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('TAP', -10, -8);
  } else {
    // Legs
    ctx.fillStyle = '#374151';
    ctx.fillRect(-7, 6, 5, 12);
    ctx.fillRect(2, 6, 5, 12);
    // Body
    ctx.fillStyle = npc.color;
    ctx.fillRect(-10, -14, 20, 22);
    // Head
    ctx.fillStyle = '#e8b896';
    ctx.beginPath();
    ctx.arc(0, -22, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = npc.hair;
    ctx.beginPath();
    ctx.arc(0, -25, 8, Math.PI, 0);
    ctx.fill();
    // Soft-zone indicator (subtle)
    ctx.fillStyle = 'rgba(251,113,133,0.35)';
    ctx.fillRect(-5, 4, 10, 8);
  }

  // Nameplate
  ctx.fillStyle = defeated ? '#6b7280' : '#e8e8f0';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(npc.name + (defeated ? ' ✕' : ''), 0, -38);
  ctx.restore();
}

/** Side-view combat: Rusana */
export function drawRusanaCombat(ctx, x, y, anim, frame, facingRight = true) {
  ctx.save();
  ctx.translate(x, y);
  if (!facingRight) ctx.scale(-1, 1);

  const kick = anim === 'kick';
  const knee = anim === 'knee';
  const victory = anim === 'victory';

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Back leg
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-8, -20, 10, 28);

  // Front leg — kick / knee pose
  if (kick) {
    // Raised kick into groin
    ctx.save();
    ctx.translate(4, -18);
    ctx.rotate(-0.9 - frame * 0.15);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 10, 36);
    // Shoe
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 32, 18, 8);
    ctx.restore();
  } else if (knee) {
    ctx.save();
    ctx.translate(6, -10);
    ctx.rotate(-0.5 - frame * 0.1);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 12, 28);
    ctx.fillStyle = '#e8b896';
    ctx.beginPath();
    ctx.arc(6, 26, 7, 0, Math.PI * 2);
    ctx.fill(); // knee tip
    ctx.restore();
  } else {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(2, -20, 10, 28);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(-8, 6, 12, 6);
    ctx.fillRect(2, 6, 12, 6);
  }

  // Torso — burgundy crop
  ctx.fillStyle = '#9f1239';
  ctx.fillRect(-14, -55, 28, 36);

  // Shorts
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(-15, -22, 30, 14);

  // Arms
  ctx.fillStyle = '#e8b896';
  if (kick || knee) {
    ctx.fillRect(-20, -50, 8, 28);
    ctx.fillRect(10, -48, 8, 22);
  } else if (victory) {
    ctx.fillRect(-22, -70, 8, 30);
    ctx.fillRect(14, -70, 8, 30);
  } else {
    ctx.fillRect(-20, -48, 8, 26);
    ctx.fillRect(12, -48, 8, 26);
  }

  // Head
  ctx.fillStyle = '#e8b896';
  ctx.beginPath();
  ctx.arc(0, -68, 14, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(0, -72, 13, Math.PI * 1.05, -0.1);
  ctx.fill();
  ctx.fillRect(8, -74, 7, 22); // ponytail

  // Cold eyes
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(2, -70, 5, 3);
  ctx.fillRect(-6, -70, 4, 2);

  // Mouth — slight smirk
  ctx.strokeStyle = '#9f1239';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(4, -62, 4, 0.1, Math.PI * 0.7);
  ctx.stroke();

  ctx.restore();
}

/**
 * Side-view guy with soft-zone hitbox.
 * states: idle | flinch | double_over | knees | floor | tap
 * Returns softZone rect in world coords for hit tests.
 */
export function drawGuyCombat(ctx, x, y, guyState, swell, flash) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  let softLocal = { x: -10, y: -18, w: 20, h: 16 }; // pelvis soft-zone

  const skin = flash > 0 ? '#fda4af' : '#e8b896';
  const shirt = '#3b82f6';
  const pants = '#1e293b';

  if (guyState === 'floor' || guyState === 'tap') {
    // On the ground, curled
    ctx.fillStyle = pants;
    ctx.fillRect(-30, -8, 40, 16);
    ctx.fillStyle = shirt;
    ctx.fillRect(-10, -18, 36, 18);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(28, -12, 12, 0, Math.PI * 2);
    ctx.fill();
    // Hands clutching crotch
    ctx.fillStyle = skin;
    ctx.fillRect(-22, -4, 14, 10);
    softLocal = { x: -24, y: -6, w: 22, h: 14 };
    if (guyState === 'tap') {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('СДАЮСЬ', -28, -28);
    }
  } else if (guyState === 'knees') {
    // On knees
    ctx.fillStyle = pants;
    ctx.fillRect(-14, -5, 12, 20);
    ctx.fillRect(2, -5, 12, 20);
    ctx.fillStyle = shirt;
    ctx.fillRect(-16, -45, 32, 42);
    // Bent forward
    ctx.save();
    ctx.translate(0, -40);
    ctx.rotate(0.45);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -18, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Hands on crotch
    ctx.fillStyle = skin;
    ctx.fillRect(-12, -16, 24, 12);
    softLocal = { x: -12, y: -16, w: 24, h: 14 };
  } else if (guyState === 'double_over') {
    ctx.fillStyle = pants;
    ctx.fillRect(-10, -25, 10, 32);
    ctx.fillRect(2, -25, 10, 32);
    ctx.save();
    ctx.translate(0, -30);
    ctx.rotate(0.85);
    ctx.fillStyle = shirt;
    ctx.fillRect(-14, -35, 28, 40);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -42, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = skin;
    ctx.fillRect(-14, -22, 28, 14);
    softLocal = { x: -12, y: -20, w: 24, h: 14 };
  } else if (guyState === 'flinch') {
    ctx.fillStyle = pants;
    ctx.fillRect(-10, -28, 10, 36);
    ctx.fillRect(4, -28, 10, 36);
    ctx.fillStyle = shirt;
    ctx.fillRect(-16, -60, 32, 36);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(4, -72, 13, 0, Math.PI * 2);
    ctx.fill();
    // Hands flying to crotch
    ctx.fillStyle = skin;
    ctx.fillRect(-18, -30, 10, 18);
    ctx.fillRect(10, -28, 10, 16);
    softLocal = { x: -10, y: -22, w: 20, h: 16 };
    // Pain face
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, -74, 4, 2);
    ctx.fillRect(6, -74, 4, 2);
  } else {
    // idle
    ctx.fillStyle = pants;
    ctx.fillRect(-10, -28, 10, 36);
    ctx.fillRect(4, -28, 10, 36);
    ctx.fillStyle = shirt;
    ctx.fillRect(-16, -62, 32, 38);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -74, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.arc(0, -78, 12, Math.PI, 0);
    ctx.fill();
    softLocal = { x: -10, y: -20, w: 20, h: 16 };
  }

  // Soft-zone visual (always show subtly in combat)
  const swellBoost = swell * 3;
  ctx.fillStyle = flash > 0
    ? 'rgba(251,113,133,0.85)'
    : `rgba(251,113,133,${0.35 + swell * 0.15})`;
  ctx.fillRect(
    softLocal.x - swellBoost / 2,
    softLocal.y - swellBoost / 2,
    softLocal.w + swellBoost,
    softLocal.h + swellBoost
  );
  ctx.strokeStyle = 'rgba(251,113,133,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    softLocal.x - swellBoost / 2,
    softLocal.y - swellBoost / 2,
    softLocal.w + swellBoost,
    softLocal.h + swellBoost
  );

  // Label
  ctx.fillStyle = '#fb7185';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('soft-zone', 0, softLocal.y + softLocal.h + 12);

  ctx.restore();

  return {
    x: x + softLocal.x - swellBoost / 2,
    y: y + softLocal.y - swellBoost / 2,
    w: softLocal.w + swellBoost,
    h: softLocal.h + swellBoost,
  };
}

export function drawCombatBg(ctx, w, h) {
  // Campus alley backdrop
  ctx.fillStyle = '#1a1a26';
  ctx.fillRect(0, 0, w, h);
  // Ground
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  // Wall
  ctx.fillStyle = '#252536';
  ctx.fillRect(0, 0, w, h * 0.72);
  // Brick lines
  ctx.strokeStyle = '#1a1a26';
  ctx.lineWidth = 1;
  for (let by = 20; by < h * 0.72; by += 28) {
    ctx.beginPath();
    ctx.moveTo(0, by);
    ctx.lineTo(w, by);
    ctx.stroke();
  }
  // Dumpster / props
  ctx.fillStyle = '#374151';
  ctx.fillRect(40, h * 0.55, 70, 80);
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(820, h * 0.5, 90, 100);
  // Title
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, w, 26);
  ctx.fillStyle = '#fb7185';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('Стычка · soft-zone = чистый хит', 12, 17);
}

/** Hit spark VFX */
export function drawHitSpark(ctx, x, y, life) {
  if (life <= 0) return;
  const a = Math.min(1, life);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fb7185';
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + (1 - life) * 2;
    const r = 10 + (1 - life) * 30;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, 6 * a, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
