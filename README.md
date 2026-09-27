# Боллбастер: Империя паха — 3D (21+)

Real-time 3D browser game shell (three.js, ES modules, no build step, no CDN at runtime). Russian UI.
**Adults only (21+). All characters are fictional adults (21+).**

Live: https://blaseflat.github.io/ballbuster-empire/ · old 2D prototype: `/legacy/`

## Run locally
```bash
cd bb3d-web && python3 -m http.server 8080   # open http://localhost:8080/  (?debug shows fps)
```

## Controls
| Context | Keys |
|---|---|
| Menu | НАЧАТЬ / Enter |
| Gym | WASD / arrows — walk · hold mouse + drag — orbit camera · wheel — zoom · **E** — подойти (start fight) |
| Fight | **J / 1** — ап-кик (`rus_kick_up`) · **K / 2** — колено (`rus_knee`) · **C** — flip camera side · **Esc** — отступить |
| Victory | E / Enter — продолжить |
| Any | ` (backquote) / F2 — fps counter |

## Game flow
Loading (progress bar) → menu (orbiting 3D gym) → gym exploration (third-person follow cam, walk/idle crossfade,
guys Дима 22 / Артём 21 / Макс 24 with tinted shirts, «E — подойти» prompt) → fight (guy placed per CONTACT.json per strike,
3/4 combat camera rotated 20° toward Rusana's front, low so the groin line reads) → contact: hit-stop, camera shake,
white flash, sparks + shockwave + impact light, guy reaction timeline (flinch → stun beat → state clip) → state track
стоит → вздрогнул → согнулся → на коленях → на полу → тап. Finishing hit is slow-mo. Victory: `rus_victory`, text, reputation,
return to exploration; the beaten guy stays on the floor (label «повержен»).

Scoring is ported 1:1 from the Phase-1 2D game (`legacy/js/game.js`) and `DESIGN_v1.md §4`: clean +1 Hit (hard/thigh 0),
3 cleans with gaps ≤1.5 s → ×1.5, swell after 2 cleans → ×1.25, state bonus flinch1/double_over2/knees3/floor4/tap5,
reputation += 10 + floor(score). Clean chance: kick 82 %, knee 90 %.

## Character assets
`assets/models/rusana.glb`, `guy.glb` (meshopt + WebP; decoded with the vendored `MeshoptDecoder`),
optional `CONTACT.json` (per-strike contact time, distance, crossfade, hit-stop, guy reaction sequence) and
`anim_meta.json`, plus `manifest.json` written by the sync script.
Missing clips fall back to idle with a console warning; guy clip names work with or without the `guy_` prefix.
Optional clips used if present: `rus_approach`, `flinch_knee`, `stun`, `hurt`.

### Sync final assets (one command)
```bash
./sync_assets.sh            # copy /workspace/bb3d/opt/{rusana,guy}.glb (+CONTACT.json, anim_meta.json), write manifest, bump ?v=
./sync_assets.sh --deploy   # same, then commit + push + wait for GitHub Pages (deploy.sh)
```

## Tech
three.js r169 vendored in `vendor/three` (MIT). WebGL2, sRGB output, ACES filmic, PCF soft shadows (sun + 1 spot),
HDRI image-based lighting (PMREM), EffectComposer: MSAA×4 half-float target → UnrealBloom (subtle) → OutputPass.
Adaptive resolution (DPR 0.7–1.75) keeps ~60 fps. Cache-busting: `?v=N` on every module in the import map (`VERSION`).

## Credits / licenses
- three.js — MIT (`vendor/three/LICENSE`)
- HDRI `gym_01` (1k) — Poly Haven, CC0 — https://polyhaven.com/a/gym_01
- Textures (1k, recompressed) — Poly Haven, CC0: `rubber_tiles`, `red_brick`, `leather_red_02`, `concrete_floor_painted`, `wood_floor`, `painted_plaster_wall`
- Fonts — Russo One, Rubik — SIL Open Font License (Google Fonts), self-hosted in `assets/fonts`
- Gym geometry, posters, neon, lockers, ring, bags, weights: procedural (this repo)
- Characters: produced by the project's own Blender/MPFB pipeline (MakeHuman CC0 assets)
