// Open-combat rules (stage 1): accuracy grading instead of a dice roll, and the pain meter.
// Pure logic — no three.js scene access; main.js feeds it distances / angles / timings.
import { COMBAT, GUY_STATES_ORDER } from '@bb/config';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (x, ok, zero) => clamp01(1 - (x - ok) / (zero - ok));

export const GRADE_RU = { perfect: 'ИДЕАЛЬНО!', clean: 'ЧИСТО!', glance: 'Скользом', miss: 'Мимо', block: 'Блок', caught: 'Поймал ногу!' };

// Grade a strike at the contact frame.
//   distErr  — |actual root distance − ideal contact distance| (m)
//   angleDeg — angle between his facing and the direction to Rusana (0 = she is right in front)
//   timing   — { open, rhythm, dash, spam } flags
//   defense  — { guard: 0..1 weight of hands-over-groin, catching: bool }
export function gradeStrike({ move, distErr, angleDeg, timing = {}, defense = {} }) {
  const C = COMBAT;
  const dist = lin(distErr, C.distOk, C.distZero);
  const ang = lin(angleDeg, C.angOk, C.angZero);
  const acc = dist * ang;
  let bonus = 0;
  if (timing.open) bonus += C.openBonus;
  if (timing.rhythm) bonus += C.rhythmBonus;
  if (timing.dash) bonus -= C.dashPenalty;
  const score = acc + bonus;
  let grade = (acc >= C.perfectAcc || (score >= C.grade.perfect && acc >= 0.85)) ? 'perfect' : score >= C.grade.clean ? 'clean' : score >= C.grade.glance ? 'glance' : 'miss';
  // defenses only matter if the strike would actually land
  if (grade !== 'miss') {
    if (defense.catching && move === 'kick') grade = 'caught';
    else if ((defense.guard || 0) >= C.guardBlock) grade = 'block';
  }
  return { grade, acc: +acc.toFixed(3), dist: +dist.toFixed(3), ang: +ang.toFixed(3), bonus: +bonus.toFixed(2), score: +score.toFixed(3) };
}

// Pain accumulates per hit (series multiplier), decays slowly; drives the reaction state.
export class Pain {
  constructor(tough = 1) { this.value = 0; this.tough = tough; this.lastHit = -99; this.chain = 0; this.peak = 0; }
  hit(grade, move, now) {
    const C = COMBAT;
    let base = grade === 'block' ? (move === 'knee' ? C.dmg.blockKnee : C.dmg.block) : (C.dmg[grade] || 0);
    if (move === 'knee') base *= C.kneeMul;
    if (base <= 0) return 0;
    const landed = grade === 'perfect' || grade === 'clean';
    if (landed) { this.chain = now - this.lastHit <= C.seriesWindow ? Math.min(3, this.chain + 1) : 0; this.lastHit = now; }
    const mult = 1 + C.seriesStep * (landed ? this.chain : 0);
    const add = base * mult / this.tough;
    this.value = Math.min(120, this.value + add);
    this.peak = Math.max(this.peak, this.value);
    return add;
  }
  update(dt, now, frozen) {
    if (frozen || now - this.lastHit < COMBAT.decayDelay) return;
    this.value = Math.max(0, this.value - COMBAT.decay * dt);
  }
  // highest state whose threshold the current pain reaches
  get state() {
    const P = COMBAT.pain; const v = this.value;
    return v >= P.floor ? 'floor' : v >= P.knees ? 'knees' : v >= P.double_over ? 'double_over' : v >= P.flinch ? 'flinch' : 'idle';
  }
  get frac() { return Math.min(1, this.value / COMBAT.pain.floor); }
}

export function stateIndex(s) { return GUY_STATES_ORDER.indexOf(s); }
