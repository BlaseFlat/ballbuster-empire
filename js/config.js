// Global config + cache-bust helper.
export const V = document.querySelector('meta[name="bb-version"]')?.content || String(Date.now());
export const asset = (p) => `assets/${p}?v=${V}`;
export const DEBUG = /[?&]debug\b/.test(location.search);

export const CFG = {
  walkSpeed: 1.45,          // m/s
  walkClipSpeed: 0.76,      // m/s the rus_walk clip was authored for (timeScale = speed / this)
  turnSpeed: 10,            // rad/s slerp factor
  interactDist: 1.9,        // guys closer than this count as "in range" for the HUD / prompt
  // Fallback contact data (used if CONTACT.json missing and auto-fit fails).
  // Clips are authored at 30 fps with the guy 0.74 m in front (anim_meta.guy_m).
  contact: {
    kick: { clip: 'rus_kick_up', time: 15 / 30, dist: 0.75, side: 0 },  // overridden per strike by CONTACT.json
    knee: { clip: 'rus_knee',    time: 12 / 30, dist: 0.35, side: 0 },
  },
  hitStop: 0.08,            // seconds; CONTACT.json hitstop_s overrides
  cancelAfterContact: 0.38, // s after contact when the next attack may interrupt recovery
  staggerBack: 0.3,         // m, double_over root motion (CONTACT.json double_over_root_motion overrides)
};

// Open combat (stage 1): accuracy instead of dice, pain accumulation, lunge/dash to target.
export const COMBAT = {
  reach: 2.3,               // m root-to-root: farthest target J/K will auto-dash to
  cone: 70,                 // deg half-angle in front of Rusana for auto-targeting (a very close guy is taken from any side)
  lungeMax: 0.55,           // m of distance error the in-strike lunge covers (beyond → dash first)
  magnet: 0.72,             // share of the distance error the lunge corrects (rest shows up as accuracy error)
  dashSpeed: 3.4,           // m/s
  dashStop: 0.3,            // dash ends this far outside the ideal distance, the lunge does the rest
  // accuracy: distance error (m) → 1 at ≤ distOk, 0 at ≥ distZero; facing angle (deg, 0 = his front) → 1 at ≤ angOk, 0 at ≥ angZero
  distOk: 0.03, distZero: 0.36, angOk: 20, angZero: 115,
  openBonus: 0.18,          // timing: striking into an opening (taunt, wind-up, feint, winded, unaware)
  rhythmBonus: 0.1,         // timing: follow-up pressed 0.2–0.9 s after the previous contact
  dashPenalty: 0.1,         // strike straight out of a long dash is a bit less precise
  spamWindow: 1.3,          // s: ≥3 presses inside this window = spamming (guy can catch the leg)
  grade: { perfect: 1.0, clean: 0.55, glance: 0.22 },   // score thresholds (perfect also needs raw accuracy ≥ 0.85)
  perfectAcc: 0.97,         // …or near-flawless spacing + facing without any timing bonus
  guardBlock: 0.55,         // guard weight at contact that blocks the strike
  // pain meter
  dmg: { perfect: 30, clean: 20, glance: 7, block: 3, blockKnee: 6, miss: 0 },
  kneeMul: 1.1,
  seriesWindow: 1.9,        // s between hits that still counts as a series
  seriesStep: 0.15,         // +15 % damage per chained hit (max 3)
  decay: 3.2,               // pain points / s when not hit for decayDelay s
  decayDelay: 1.2,
  pain: { flinch: 10, double_over: 34, knees: 62, floor: 95 },
  resetAfter: 9,            // s without hits and pain 0 → the bout resets (fresh fight)
  hitStopPerfect: 0.09,
};

// Personalities. weights = proactive choices (per decision tick while Rusana is close), react = chance to
// respond to a strike already in motion, tough = pain divisor (качок = high pain threshold).
export const TRAITS = {
  cocky:  { ru: 'наглый', tough: 1.0, react: 0.25, grab: 0.25, guard: 0.15, turn: 0.05, step: 0.1, flee: 0,    feint: 0.35, taunt: 0.45, shove: 0.05, speed: 1.2,
    lines: ['Ну давай, мелкая!', 'Попробуй ещё', 'Ха, мимо!', 'Это всё?'] },
  coward: { ru: 'трус',   tough: 1.15, react: 0.5, grab: 0.05, guard: 0.45, turn: 0.35, step: 0.3, flee: 0.45, feint: 0,    taunt: 0.05, shove: 0,    speed: 1.55,
    lines: ['Не надо!', 'Отстань!', 'Я просто тренируюсь!'] },
  jock:   { ru: 'качок',  tough: 1.6, react: 0.3, grab: 0.35, guard: 0.3, turn: 0.1, step: 0.05, flee: 0,    feint: 0.1,  taunt: 0.3,  shove: 0.2,  speed: 1.1,
    lines: ['Не больно', 'Слабо', 'Давай сильнее'] },
  angry:  { ru: 'злой',   tough: 1.15, react: 0.35, grab: 0.3, guard: 0.25, turn: 0.1, step: 0.1, flee: 0,    feint: 0.05, taunt: 0.15, shove: 0.55, speed: 1.25,
    lines: ['Ну всё, тебе конец!', 'Отвали!', 'Сейчас получишь!'] },
  runner: { ru: 'беглец', tough: 1.0, react: 0.45, grab: 0.1, guard: 0.15, turn: 0.15, step: 0.5, flee: 0.5,  feint: 0.1,  taunt: 0.15, shove: 0,    speed: 1.9,
    lines: ['Не догонишь!', 'Лови, если сможешь', 'Ха-ха!'] },
};

// NPCs. To add one: copy an entry, give it a unique id, a free spot (pos/rot) and a trait from TRAITS.
// model: body variant GLB (guy / guy_b / guy_c — same rig and clips; falls back to guy if missing); shirt: tint.
export const GUY_MODELS = ['guy', 'guy_b', 'guy_c'];
export const GUYS = [
  { id: 'dima',  name: 'Дима',  age: 22, trait: 'cocky',  model: 'guy', shirt: 0x2f6fd6, pos: [-3.2, 0, -1.6], rot: 0.6, voice: 1.0,
    taunt: 'Дима: «Ну давай, покажи, что умеешь, мелкая».',
    win: 'Дима свернулся на матах и хлопает ладонью по полу. Больше не шутит.' },
  { id: 'artem', name: 'Артём', age: 21, trait: 'coward', model: 'guy_b', shirt: 0x2fa36b, pos: [3.6, 0, 1.4], rot: -2.2, voice: 1.05,
    taunt: 'Артём: «Я вообще-то на тренировку пришёл…»',
    win: 'Артём стоит на коленях, прижимая руки к паху, и сдаётся.' },
  { id: 'maks',  name: 'Макс',  age: 24, trait: 'angry',  model: 'guy_c', shirt: 0x1d1d22, pos: [0.8, 0, -4.6], rot: 2.8, voice: 0.93,
    taunt: 'Макс: «Я тут главный по залу. Иди отсюда».',
    win: 'Макс, «главный по залу», лежит пластом и тапает. Зал теперь твой.' },
  { id: 'stas',  name: 'Стас',  age: 23, trait: 'jock',   model: 'guy_b', shirt: 0xb8322a, pos: [-6.4, 0, -3.6], rot: 0.9, voice: 0.9,
    taunt: 'Стас: «Я пресс качаю каждый день. Мне ничего не будет».',
    win: 'Стас, весь такой накачанный, скрючился на полу и тапает.' },
  { id: 'lyokha', name: 'Лёха', age: 21, trait: 'runner', model: 'guy_c', shirt: 0xd9a21e, pos: [7.2, 0, 1.8], rot: -1.8, voice: 1.08,
    taunt: 'Лёха: «Сначала догони!»',
    win: 'Лёха больше никуда не бежит — лежит и хлопает по мату.' },
];

export const STATE_RU = {
  idle: 'стоит', flinch: 'вздрогнул', double_over: 'согнулся пополам',
  knees: 'на коленях', floor: 'на полу', tap: 'сдаётся (тап)',
};
export const GUY_STATES_ORDER = ['idle', 'flinch', 'double_over', 'knees', 'floor', 'tap'];
