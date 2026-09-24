/** Global game state — Phase 1 */
export const state = {
  screen: 'menu', // menu | campus | combat
  reputation: 0,
  trophies: 0,
  keys: Object.create(null),
  nearestNpc: null,
  combatNpc: null,
  defeated: Object.create(null), // npcId -> true
};

export const NPCS = [
  {
    id: 'dima',
    name: 'Дима',
    bio: 'Студент, 22. Самоуверенный. Думает, что «это не больно».',
    x: 620,
    y: 280,
    color: '#60a5fa',
    hair: '#1e3a5f',
  },
  {
    id: 'kirill',
    name: 'Кирилл',
    bio: 'Спортсмен, 23. Крепкий пресс — слабый пах.',
    x: 780,
    y: 380,
    color: '#34d399',
    hair: '#14532d',
  },
];

export function addReputation(n) {
  state.reputation += n;
}

export function addTrophy() {
  state.trophies += 1;
}

export function markDefeated(id) {
  state.defeated[id] = true;
}

export function isDefeated(id) {
  return !!state.defeated[id];
}
