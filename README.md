# Боллбастер: Империя паха — Phase 1 (HTML5)

Playable adult (21+) prototype. Pure HTML/CSS/JS, no build step. Russian UI.

## Run locally

```bash
cd ballbuster-web
python3 -m http.server 8080
```

Open http://localhost:8080/

Or any static server that serves this folder (itch.io HTML zip works the same).

## Controls

| Context | Keys |
|---------|------|
| Campus  | WASD / arrows — walk · **E** — talk / fight |
| Combat  | **1 / J** — ап-кик (`rus_kick_up`) · **2 / K** — колено (`rus_knee`) · **R** — рошамбо |
| Roshambo| mouse — камень / бумага / ножницы |

## Phase 1 contents

1. Main menu — title «Боллбастер: Империя паха», Start, 21+ note  
2. Campus hub — top-down canvas, Русана walks, 2 male NPCs (Дима 22, Артём 21)  
3. **E** near NPC → encounter panel  
4. Combat — soft-zone groin hits, guy states `idle → flinch → double_over → knees → floor → tap`  
5. Scoring — clean +1 Hit; miss/hard = 0; 3 cleans ≤1.5s pause → combo ×1.5; state points; swell ×1.25 after 2 cleans  
6. Roshambo best of 3 — win = guaranteed clean; lose = flinch-counter, no damage to Rusana  
7. Victory → campus + reputation counter  

## itch.io upload

Use `dist/Ballbuster_web_phase1.zip` — `index.html` is at the zip root.

This project → Kind of project: **HTML** → upload the zip.

## Files

```
index.html
css/style.css
js/game.js
README.md
dist/Ballbuster_web_phase1.zip
```

Design reference: `../ballbuster-godot/docs/DESIGN_v1.md` (Phase 1 only).
