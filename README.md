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
| Gym (open combat, no separate fight mode) | WASD / arrows — walk · hold mouse + drag — orbit camera · wheel — zoom · **J / 1** — ап-кик (`rus_kick_up`) · **K / 2** — колено (`rus_knee`) · **C** — flip combat-camera side · walk away = leave |
| Victory | E / Enter / Space — продолжить |
| Any | **M** — sound · ` (backquote) / F2 — fps counter |

## Open combat (stage 1, v7)
- **Strikes any time.** J/K auto-target the nearest guy in a 70° cone in front of Rusana (or of the WASD direction; a guy right next to her counts from any side) within 2.3 m. Slightly out of range → a short lunge inside the strike; farther → a quick dash, then the strike. A doubled-over guy only takes the knee (contact adjusted to his hips-back pose); on his knees / on the floor he can't be struck (wait until he gets up). Presses during a strike are buffered; after contact + 0.38 s the next strike cancels the recovery.
- **Accuracy instead of dice** (`js/combat.js`, tunables in `COMBAT` in `js/config.js`): distance error at the contact frame vs the ideal 0.667 m root-to-root (CONTACT.json; measured at his pelvis, so hips-back poses count), his facing angle (front vs side/back), timing (striking into an opening: taunt, wind-up, feint, winded after running, unaware guy; or in rhythm 0.2–0.9 s after the previous landed hit; −penalty straight out of a long dash). The in-strike lunge corrects 72 % of the distance error, the rest shows as inaccuracy → stand at the right distance for «Идеально». Grades: **Идеально** (bonus damage/score, longer hit-stop, bigger fx + extra impact layer) · **Чисто** · **Скользом** · **Мимо** · **Блок** · **Поймал ногу!**
- **Pain meter** instead of hit counting: perfect 30 / clean 20 / glance 7 / block 3 (knee 6) pain, knee ×1.1, series (hits ≤1.9 s apart) +15 % per hit (max 3), decays 3.2/s after 1.2 s without hits, divided by the trait's toughness. Thresholds: вздрогнул 10 → согнулся 34 → на коленях 62 → на полу 95 → тап → victory. Recovery is shorter: he holds the bent-over pose ~0.7 s (knee-able) and gets up 1.35× faster.
- **Guy AI** (`js/ai.js`), all telegraphed (status line in his label + pose): closes up with hands over the groin (guard pose layered from the `stun` clip; blocks), turns his hip away, steps back, runs away (procedural gait) and then stands winded (opening), catches the leg if Rusana spams kicks (her leg is held, then she gets shoved back), feints (fake guard → drop → opening), taunts (speech bubble; opening), wind-up + shove (злой; striking into the wind-up is an opening).
- **Personalities** (`TRAITS` in `js/config.js`): Дима 22 — наглый (rarely guards, feints, taunts, sometimes catches), Артём 21 — трус (guards, turns away, runs), Макс 24 — злой (shoves back), Стас 23 — качок (pain divided by 1.6, catches the leg), Лёха 21 — беглец (steps back, runs fast). Add a guy: copy an entry in `GUYS` with a free `pos` and a `trait`.
- Scoring/victory flow unchanged: Hits = landed strikes, combo ×1.5, swell ×1.25, «Идеально» +0.5, state bonus for every state passed, floor → tap → `rus_victory`, reputation += 10 + floor(score), the beaten guy stays on the floor («повержен»). Stagger / escape movement is clamped against walls and props (smooth, no pop).

### Test hooks (console, `window.__bb`)
`__bb.strike('kick'|'knee')` (= J/K) · `__bb.goTo(i, dist?, {angle})` (Rusana in front of guy i) · `__bb.guyDo(i, 'guard'|'turn'|'step'|'flee'|'feint'|'taunt'|'windup'|'catch')` · `__bb.setPain(i, v)` · `__bb.aiOff = true` (guys stand still) · `__bb.forceGrade = 'perfect'|'clean'|'glance'|'miss'|'block'` (`forceClean` still works) · `__bb.info()` (guys, AI mode, pain, strikeable, last grade breakdown) · `__bb.manual = true; __bb.step(1/30)` (deterministic stepping) · `__bb.noRender = true` (skip rendering for fast headless logic runs) · `__bb.paused`, `__bb.onFrame`, `__bb.alwaysTalk`.

## Game flow
Loading (progress bar) → menu (orbiting 3D gym) → gym (third-person follow cam, walk/idle crossfade, five guys with tinted shirts and «имя, возраст · характер» labels, status line, pain bar, speech bubbles) → open combat (the camera frames Rusana and the engaged guy and drifts to a 3/4 side view while she stands still; fight HUD with pain bar, state track, hits/combo/swell/score) → contact: hit-stop, camera shake, flash, sparks + shockwave + impact light, grade popup, guy reaction timeline (flinch → double_over → recover / knees / floor → tap). Finishing hit is slow-mo. Victory: `rus_victory`, text, reputation, back to the gym.

## Character assets
`assets/models/rusana.glb`, `guy.glb` (meshopt + WebP; decoded with the vendored `MeshoptDecoder`),
optional `CONTACT.json` (per-strike contact time, distance, crossfade, hit-stop, guy reaction sequence) and
`anim_meta.json`, plus `manifest.json` written by the sync script.
Missing clips fall back to idle with a console warning; guy clip names work with or without the `guy_` prefix.
Optional clips used if present: `flinch_knee`, `stun` (guard pose source), `hurt`, `clinched`.

### Sync final assets (one command)
```bash
./sync_assets.sh            # copy /workspace/bb3d/opt/{rusana,guy}.glb (+CONTACT.json, anim_meta.json), write manifest, bump ?v=
./sync_assets.sh --deploy   # same, then commit + push + wait for GitHub Pages (deploy.sh)
```

## Tech
three.js r169 vendored in `vendor/three` (MIT). WebGL2, sRGB output, ACES filmic, PCF soft shadows (sun + 1 spot),
HDRI image-based lighting (PMREM), EffectComposer: MSAA×4 half-float target → UnrealBloom (subtle) → OutputPass.
Adaptive resolution (DPR 0.7–1.75) keeps ~60 fps. Cache-busting: `?v=N` on every module in the import map (`VERSION`).

## Sound (v6)
- `js/audio.js` — Web Audio: buffers preloaded during the loading screen (decoded offline, AudioContext created on the first click/key → no autoplay warnings), buses `impact / voice / rus / step / amb / music` → compressor, room-reverb send (runtime IR), game-time scheduler so delays follow the fight timeline (hit-stop included).
- Hooks: contact frame (CONTACT.json) → layered impact (body thud + punch + sub + flesh slap + soft; finisher adds big punch/slap/boom; thigh miss → light slap); guy reaction clips → vocals (flinch/flinch_knee → gasp/grunt 30–80 ms after the clip starts, finisher → scream, double_over → choked groan/wheeze, knees → whimper, getup → strained whimper, floor → moaning that repeats and fades, tap → whimper); one voice per guy with priorities, no immediate repeats, per-guy pitch.
- Rusana (TTS, few & optional): fight start (75 %), after a clean hit (40 %, ≥5 s apart), on the finishing strike, on victory. Footsteps from her foot bones (mats vs rubber floor). Ambience: room tone + distant muffled music (ducked in fights).
- **M** or the speaker icon (bottom-right) mutes; hover it for the volume slider. Stored in `localStorage["bb3d.audio"]`.
- Rebuild the set: `python3 tools/audio/build_audio.py` (needs numpy, scipy, soundfile, ffmpeg; sources cached in `$BB_AUDIO_SRC`). All sources/licenses: [CREDITS.md](CREDITS.md).

## Credits / licenses
See also [CREDITS.md](CREDITS.md) (full list incl. every sound).

- three.js — MIT (`vendor/three/LICENSE`)
- HDRI `gym_01` (1k) — Poly Haven, CC0 — https://polyhaven.com/a/gym_01
- Textures (1k, recompressed) — Poly Haven, CC0: `rubber_tiles`, `red_brick`, `leather_red_02`, `concrete_floor_painted`, `wood_floor`, `painted_plaster_wall`
- Fonts — Russo One, Rubik — SIL Open Font License (Google Fonts), self-hosted in `assets/fonts`
- Gym geometry, posters, neon, lockers, ring, bags, weights: procedural (this repo)
- Characters: produced by the project's own Blender/MPFB pipeline (MakeHuman CC0 assets)
