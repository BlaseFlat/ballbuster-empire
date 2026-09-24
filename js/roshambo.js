const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const LABELS = { rock: 'Камень', paper: 'Бумага', scissors: 'Ножницы' };
const PICKS = ['rock', 'paper', 'scissors'];

export function createRoshambo(els, { onWin, onLose, onClose }) {
  let you = 0, him = 0, round = 1, locked = false, seriesOver = false;

  function show() {
    you = 0; him = 0; round = 1; locked = false; seriesOver = false;
    els.overlay.classList.remove('hidden');
    updateUI('Выбери жест:');
    setButtons(true);
  }
  function hide() { els.overlay.classList.add('hidden'); }
  function updateUI(msg) {
    els.you.textContent = String(you);
    els.him.textContent = String(him);
    els.round.textContent = String(Math.min(round, 3));
    els.status.textContent = msg;
  }
  function setButtons(enabled) { for (const b of els.picks) b.disabled = !enabled; }

  function play(playerPick) {
    if (locked || seriesOver) return;
    locked = true;
    setButtons(false);
    const enemyPick = PICKS[Math.floor(Math.random() * 3)];
    let line = `Ты: ${LABELS[playerPick]} · Он: ${LABELS[enemyPick]}. `;
    if (playerPick === enemyPick) {
      line += 'Ничья — переигровка.';
      updateUI(line);
      setTimeout(() => { locked = false; setButtons(true); updateUI('Ничья. Выбери снова:'); }, 900);
      return;
    }
    if (BEATS[playerPick] === enemyPick) { you += 1; line += 'Твой раунд.'; }
    else { him += 1; line += 'Его раунд.'; }
    updateUI(line);
    if (you >= 2 || him >= 2 || round >= 3) {
      seriesOver = true;
      const win = you > him;
      setTimeout(() => {
        if (win) {
          updateUI('Победа! Гарантированный чистый удар.');
          setTimeout(() => { hide(); onWin(); }, 900);
        } else {
          updateUI('Поражение. Он flinch-контратакует — без урона тебе.');
          setTimeout(() => { hide(); onLose(); }, 900);
        }
      }, 800);
      return;
    }
    round += 1;
    setTimeout(() => { locked = false; setButtons(true); updateUI(`Раунд ${round}. Выбери:`); }, 900);
  }

  for (const b of els.picks) b.addEventListener('click', () => play(b.dataset.pick));
  els.close.addEventListener('click', () => { hide(); onClose(); });
  return { show, hide, play };
}
