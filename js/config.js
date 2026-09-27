// Global config + cache-bust helper.
export const V = document.querySelector('meta[name="bb-version"]')?.content || String(Date.now());
export const asset = (p) => `assets/${p}?v=${V}`;
export const DEBUG = /[?&]debug\b/.test(location.search);

export const CFG = {
  walkSpeed: 1.45,          // m/s
  walkClipSpeed: 0.76,      // m/s the rus_walk clip was authored for (timeScale = speed / this)
  turnSpeed: 10,            // rad/s slerp factor
  interactDist: 1.9,
  // Fallback contact data (used if CONTACT.json missing and auto-fit fails).
  // Clips are authored at 30 fps with the guy 0.74 m in front (anim_meta.guy_m).
  contact: {
    kick: { clip: 'rus_kick_up', time: 15 / 30, dist: 0.75, side: 0 },  // overridden per strike by CONTACT.json
    knee: { clip: 'rus_knee',    time: 12 / 30, dist: 0.35, side: 0 },
  },
  hitStop: 0.08,            // seconds; CONTACT.json hitstop_s overrides
  cancelAfterContact: 0.38, // s after contact when the next attack may interrupt recovery
  cleanChance: { kick: 0.82, knee: 0.9 },
};

export const GUYS = [
  { id: 'dima',  name: 'Дима',  age: 22, shirt: 0x2f6fd6, pos: [-3.2, 0, -1.6], rot: 0.6,
    taunt: 'Дима: «Ну давай, покажи, что умеешь, мелкая».',
    win: 'Дима свернулся на матах и хлопает ладонью по полу. Больше не шутит.' },
  { id: 'artem', name: 'Артём', age: 21, shirt: 0x2fa36b, pos: [3.6, 0, 1.4], rot: -2.2,
    taunt: 'Артём: «Я вообще-то на тренировку пришёл…»',
    win: 'Артём стоит на коленях, прижимая руки к паху, и сдаётся.' },
  { id: 'maks',  name: 'Макс',  age: 24, shirt: 0x1d1d22, pos: [0.8, 0, -4.6], rot: 2.8,
    taunt: 'Макс: «Я тут главный по залу. Иди отсюда».',
    win: 'Макс, «главный по залу», лежит пластом и тапает. Зал теперь твой.' },
];

export const STATE_RU = {
  idle: 'стоит', flinch: 'вздрогнул', double_over: 'согнулся пополам',
  knees: 'на коленях', floor: 'на полу', tap: 'сдаётся (тап)',
};
