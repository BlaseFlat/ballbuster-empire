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
  resolve(clean) {
    const prev = this.guyState;
    if (!clean) return { clean: false, prev, next: prev, gained: 0 };
    this.hits += 1; this.cleanHits += 1;
    const now = this.time;
    if (this.lastCleanAt > 0 && now - this.lastCleanAt > COMBO_WINDOW) { this.comboMult = 1; this.comboChain = 1; }
    else this.comboChain += 1;
    if (this.comboChain >= 3) this.comboMult = 1.5;
    this.lastCleanAt = now;
    if (this.cleanHits >= SWELL_AFTER) this.swell = Math.min(2, this.cleanHits - 1);
    const painMult = this.swell >= 1 ? 1.25 : 1;
    let gained = 1 * this.comboMult * painMult;
    const idx = GUY_STATES.indexOf(prev);
    let next = prev;
    if (idx < GUY_STATES.length - 1) { next = GUY_STATES[idx + 1]; this.guyState = next; gained += STATE_POINTS[next] || 0; }
    gained = Math.round(gained * 10) / 10;
    this.score = Math.round((this.score + gained) * 10) / 10;
    const finished = this.guyState === 'tap';
    if (finished) this.ended = true;
    return { clean: true, prev, next, gained, comboMult: this.comboMult, painMult, finished };
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
