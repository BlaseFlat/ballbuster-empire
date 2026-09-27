# Боллбастер: Империя паха — Phase 1 (HTML5)

Playable adult (21+) prototype. Pure HTML/CSS/JS, no build step. Russian UI.

## Run locally

```bash
cd ballbuster-web
python3 -m http.server 8080
```

Open http://localhost:8080/

## Controls

| Context | Keys |
|---------|------|
| Campus  | WASD / arrows — walk · **E** — talk / fight |
| Combat  | **1 / J** — ап-кик (`rus_kick_up`) · **2 / K** — колено (`rus_knee`) · **R** — рошамбо |
| Roshambo| mouse — камень / бумага / ножницы |

## Phase 1 contents

1. Main menu — «Боллбастер: Империя паха», Start, 21+ note
2. Campus hub — top-down canvas, Русана, 2 NPCs (Дима 22, Артём 21)
3. **E** near NPC → encounter
4. Combat — soft-zone hits, states idle→flinch→double_over→knees→floor→tap
5. Scoring — clean +1 Hit; miss/hard 0; 3 cleans ≤1.5s → ×1.5; state points; swell ×1.25
6. Roshambo best of 3 — win = guaranteed clean; lose = flinch-counter (no damage to Rusana)
7. Victory → campus + reputation

## itch.io

Upload `dist/Ballbuster_web_phase1.zip` (HTML project; `index.html` at zip root).

## Files

`index.html` · `css/style.css` · `js/game.js` · `README.md` · `dist/Ballbuster_web_phase1.zip`

Design: `../ballbuster-godot/docs/DESIGN_v1.md` (Phase 1 only).
