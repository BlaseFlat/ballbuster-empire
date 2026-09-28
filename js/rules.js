// Scoring rules — ported 1:1 from ballbuster-web/js/game.js (Phase 1) and DESIGN_v1.md §4:
//  clean soft-zone hit = +1 Hit; hard/miss = 0; 3 cleans without a pause >1.5 s → ×1.5;
//  swell after 2 cleans → pain ×1.25; state transition bonus flinch1 double_over2 knees3 floor4 tap5;
//  tap = victory; reputation += 10 + floor(score).
export const GUY_STATES = ['idle', 'flinch', 'double_over', 'knees', 'floor', 'tap'];
export const STATE_POINTS = { flinch: 1, double_over: 2, knees: 3, floor: 4, tap: 5 };
export const COMBO_WINDOW = 1.5;
export const SWELL_AFTER = 2;

export class Bout {
  constructor(npc) {
    this.npc = npc;
    this.guyState = 'idle';
    this.hits = 0; this.cleanHits = 0; this.score = 0;
    this.comboMult = 1; this.comboChain = 0; this.lastCleanAt = 0;
    this.swell = 0; this.time = 0; this.ended = false;
  }
  get nextState() {
    const i = GUY_STATES.indexOf(this.guyState);
    return GUY_STATES[Math.min(i + 1, GUY_STATES.length - 1)];
  }
  tick(dt) {
    this.time += dt;
    if (this.lastCleanAt > 0 && this.time - this.lastCleanAt > COMBO_WINDOW && this.comboMult > 1) {
      this.comboMult = 1; this.comboChain = 0; return true;
    }
    return false;
  }
  // Stage 1: grade comes from the accuracy model (combat.js), the target state from the pain meter.
  // Landed strikes (perfect / clean) count as Hits: combo ×1.5 (3 in a row, gaps ≤1.5 s of strikeable time),
  // swell ×1.25 after 2, «Идеально» +0.5, plus the state bonus for every state passed (a big hit can skip states).
  // Glancing / blocked / missed = 0 points (still hurt a little via the pain meter). He never goes past
  // 'floor' from a hit: floor → he taps out (autoTap) → victory.
  resolveHit(grade, painState) {
    const prev = this.guyState;
    const landed = grade === 'perfect' || grade === 'clean';
    if (!landed) return { clean: false, grade, prev, next: prev, gained: 0 };
    this.hits += 1; this.cleanHits += 1;
    if (grade === 'perfect') this.perfects = (this.perfects || 0) + 1;
    const now = this.time;
    if (this.lastCleanAt > 0 && now - this.lastCleanAt > COMBO_WINDOW) { this.comboMult = 1; this.comboChain = 1; }
    else this.comboChain += 1;
    if (this.comboChain >= 3) this.comboMult = 1.5;
    this.lastCleanAt = now;
    if (this.cleanHits >= SWELL_AFTER) this.swell = Math.min(2, this.cleanHits - 1);
    const painMult = this.swell >= 1 ? 1.25 : 1;
    let gained = (grade === 'perfect' ? 1.5 : 1) * this.comboMult * painMult;
    const iPrev = GUY_STATES.indexOf(prev), iFloor = GUY_STATES.indexOf('floor');
    const iNext = Math.min(iFloor, Math.max(iPrev, GUY_STATES.indexOf(painState), 1));
    for (let i = iPrev + 1; i <= iNext; i++) gained += STATE_POINTS[GUY_STATES[i]] || 0;
    const next = GUY_STATES[Math.max(iPrev, iNext)];
    this.guyState = next;
    gained = Math.round(gained * 10) / 10;
    this.score = Math.round((this.score + gained) * 10) / 10;
    return { clean: true, grade, prev, next, gained, comboMult: this.comboMult, painMult, finished: false };
  }
  // He is on the floor and taps out (DESIGN §4 «Победа: tap / floor+добивка / сдача»): tap state bonus, no extra Hit.
  autoTap() {
    if (this.guyState === 'tap') return 0;
    this.guyState = 'tap';
    this.score = Math.round((this.score + STATE_POINTS.tap) * 10) / 10;
    this.ended = true;
    return STATE_POINTS.tap;
  }
  repGain() { return 10 + Math.floor(this.score); }
}
