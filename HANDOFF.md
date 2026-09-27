# Боллбастер: Империя паха — 3D · HANDOFF (для следующего AI-ассистента / разработчика)

Вся художественная часть — **выдумка для взрослых (21+)**, все персонажи совершеннолетние (21+).
Живой сайт: https://blaseflat.github.io/ballbuster-empire/ (ветка `main` репозитория BlaseFlat/ballbuster-empire = GitHub Pages; старая 2D-версия в `/legacy/`).
Эта ветка `source` — исходники и пайплайн (сайт не трогает). Снимок от 2026-09-27; веб-часть == `main` @ c24ca51 («Sound (v6)»).

## 1. Проект
Браузерная 3D-игра (three.js r169, ES-модули, без сборки, UI на русском). Героиня Русана ходит по спортзалу «Империя», подходит к парням и побеждает их ударами (ап-кик в пах, колено). Репутация растёт за победы.
NPC: **Дима 22**, **Артём 21**, **Макс 24** (`web/js/config.js → GUYS`).

## 2. Персонажи
- **Русана** (героиня, есть 3D-модель): миниатюрная (1.56 м), мягко-атлетичная, НЕ «перекачанная»; сильные бёдра/ляжки, сочная мягкая попа (за счёт деталей формы, а не размера), маленькая грудь (~B), загорелая, тёмный небрежный хвост, холодный доминирующий взгляд. Одежда: бордовый кроп-топ, чёрные бойцовские шорты с разрезами, белые кроссовки.
  Утверждённый референс: `ref/rusana_sheet_semirealistic_APPROVED.png` (аниме-вариант `ref/rusana_sheet_anime_NOT_chosen.png` — не выбран). Параметры тела: `pipeline/blender/rusana.json`.
- **Мира** (подруга, 3D-модели ПОКА НЕТ): высокая, худая, бледная, платиновый пикси, веснушки; белое кроп-худи, чёрные карго. Держит жертв и тоже бьёт, в т.ч. предметами. Концепты — в `ref/concept_art/` (сцены с платиновой девушкой).
- **Парень** (`guy.glb`, общий для всех NPC, отличаются цветом футболки): `pipeline/blender/guy.json`.

## 3. Управление
WASD/стрелки — ходьба · мышь (зажать+тянуть) — орбита камеры · колесо — зум · **E** — подойти/начать бой · **J/1** — ап-кик · **K/2** — колено · **C** — сторона камеры · **Esc** — отступить · **M** — звук вкл/выкл · **` / F2** — fps. (`?debug` в URL — fps.)

## 4. Бой (web/js/main.js, rules.js, CONTACT.json)
- Контакт по кадру из `CONTACT.json` (кик 0.267 с, колено — см. файл; дистанция 0.667 м root-to-root, парень развёрнут на 180°).
- hit-stop **0.06 с**, тряска камеры, вспышка, искры.
- Реакция: flinch / flinch_knee → **double_over** (стаггер назад **0.30 м** запечён в root, без «прыжка») → восстановление hurt/getup до стойки; удары во время восстановления ставятся в очередь (queued strikes), выполняются когда он выпрямился.
- Состояния: стоит → вздрогнул → согнулся → на коленях → на полу → тап. Добивающий удар — slow-mo. Пол → тап → победа (`rus_victory`, репутация += 10 + floor(score)).
- **4 чистых попадания** до победы; комбо ×1.5 (3 чистых с паузами ≤1.5 с), swell ×1.25 после 2; шанс чистого: **кик 82 %, колено 90 %** (`CFG.cleanChance`).
- Тест-хуки в консоли: `__bb.paused=true` (заморозка), `__bb.forceClean=true/false`, `__bb.onFrame=fn`, `__bb.manual=true; __bb.step(1/30)` (детерминированный шаг для записи видео).

## 5. Где что лежит (ветка `source`)
| Путь | Что |
|---|---|
| `web/` | исходник сайта (= то, что деплоится в `main`): `index.html`, `js/` (main, gym, character, fx, audio, rules, config, loader), `css/`, `assets/models/*.glb + CONTACT.json + anim_meta.json + manifest.json`, `assets/audio/`, `vendor/three`, `tools/audio/build_audio.py`, `sync_assets.sh`, `deploy.sh`, `README.md`, `CREDITS.md`, `legacy/` |
| `pipeline/` | персонажи/анимация (на боксе было `/workspace/bb3d`): `blender/pipeline.py` (сборка персонажа MPFB→.blend, шорты и хвост генерятся кодом), `blender/rusana.json`, `guy.json`, `rigdump.py`, `bake.py`, `export_glb.py`, лаборатории подгонки `fitlab.py / lab.py / optimize_contact.py / penetration.py`, превью `preview.py / scene_preview.py / sheet.sh`, `gen_tex.py`; `anim/` (процедурная анимация на Python: `strike_params.json`, `strikes.py`, `clips.py`, `poses.py`, `author2.py`…); `tools/post.mjs`; `verify/` (three.js-проверка поз); `tex/`; `out/*.blend` (rusana, guy, *_anim), `out/*.json` (риги, анимации, маски, anim_meta); `opt/` (финальные `rusana.glb`, `guy.glb`, `CONTACT.json`); `renders/final` (примеры) |
| `mpfb_assets_used/data/` | только используемые ассеты MakeHuman (глаза, брови, ресницы, зубы, волосы, скины, одежда) + `packs/*.json` с лицензиями |
| `audio_src/` | исходники звука (Freesound CC0 mp3 `fs/` + `fs/meta.json`, Kenney CC0, TTS Русаны `tts/`) |
| `ref/` | референсы/концепты (Русана, Мира, UI «Рошамбо») |
| `screenshots/` | скриншоты 3D-игры |
| `test_harness/` | puppeteer-скрипты захвата/проверки (`capture.mjs`, `shoot.mjs`, `snd.mjs`…) |
| `prototypes/` | 2D-веб фаза 1 (`ballbuster-web`), Godot-прототип (`ballbuster-godot`, там `docs/DESIGN_v1.md` — геймдизайн, правила счёта), `rusana-story` |

Большие/регенерируемые файлы — только в ZIP-архиве (`ballbuster-empire-full-*.zip`, папка `extras/`), см. §9.

## 6. Софт (версии)
Blender **4.2.23 LTS** · MPFB **2.0.17** (расширение Blender, `bl_ext.user_default.mpfb`) · MakeHuman asset packs (makehumancommunity.org) · Node **20.19** (+ `npm ci` в `pipeline/`: @gltf-transform/cli 4.5, puppeteer-core, sharp, three) · Python **3.11+** (numpy; для звука numpy, scipy, soundfile, edge-tts) · ffmpeg 7 · git, gh CLI. Браузер с WebGL2.

## 7. Пересборка персонажей (Blender → GLB → сайт)
Скрипты содержат абсолютные пути `/workspace/bb3d`, `/workspace/tools/blender/blender-4.2.23-linux-x64/blender`, `/home/box/.config/blender/4.2/extensions/...`. Проще всего воспроизвести раскладку (Linux) или заменить пути: `grep -rl /workspace/bb3d pipeline | xargs sed -i "s#/workspace/bb3d#$PWD/pipeline#g"`, аналогично путь к Blender (`build_glb.sh`, `rebuild_anim.sh`, `blender/sheet.sh`) и `DATA_SYS/DATA_USR` в `blender/pipeline.py`.
1. Установить Blender 4.2 LTS, поставить расширение MPFB 2.0.17 (Extensions → Install from disk; zip — в архиве `extras/mpfb.zip`), скопировать `mpfb_assets_used/data/*` в пользовательскую папку данных MPFB (`.../extensions/.user/user_default/mpfb/data/`).
2. Персонаж: `blender -b --python blender/pipeline.py -- blender/rusana.json` (и `guy.json`) → `out/rusana.blend`, `out/rusana_masks.json`.
3. Риг: `blender -b out/rusana.blend --python blender/rigdump.py -- out/rusana_rig.json` (так же guy).
4. Анимация: правка `anim/strike_params.json` / `anim/clips.py` → `./rebuild_anim.sh` (author2.py → `out/*_anim.json`, `anim_meta.json`; bake.py → `out/*_anim.blend`).
5. GLB: `cd pipeline && npm ci && ./build_glb.sh` → export_glb.py → post.mjs (имена клипов, морфы-выражения, моргание) → gltf-transform webp+meshopt → `opt/rusana.glb`, `opt/guy.glb`.
6. `opt/CONTACT.json` — ведётся вручную по замерам (fitlab/optimize_contact); при изменении ударов обновить кадры контакта/дистанцию.
7. На сайт: `cd web && ./sync_assets.sh` (копирует GLB+CONTACT+anim_meta, пишет manifest, повышает `?v=`; пути через `BB_SRC`, `BB_META`).
Звук: `BB_AUDIO_SRC=../audio_src python3 web/tools/audio/build_audio.py` (сначала декодировать `audio_src/fs/*.mp3` → `audio_src/wav/<id>.wav`, 44.1 kHz mono: `ffmpeg -i fs/ID.mp3 -ar 44100 -ac 1 wav/ID.wav`).

## 8. Деплой (GitHub Pages)
`cd web && ./deploy.sh "сообщение"` — зеркалит `web/` в клон репо (`BB_REPO`, по умолчанию `/workspace/bb3d-web-repo`), коммит+push в `main`, ждёт сборку Pages через `gh api`. Нужен доступ на push к BlaseFlat/ballbuster-empire. Локально: `cd web && python3 -m http.server 8080`.
**Не пушить исходники в main** — только содержимое `web/`.

## 9. Не вошло в git (есть в ZIP `extras/` или скачивается)
- Blender 4.2.23 (скачать: https://download.blender.org/release/Blender4.2/), полные MakeHuman asset packs (~1.1 ГБ, https://files.makehumancommunity.org/asset_packs/…), полная папка MPFB data (1.3 ГБ), `node_modules`, Godot-бинарники — регенерируемо/скачивается.
- В ZIP: `mpfb.zip` (аддон), `out/*.blend1`, `rusana_raw.blend`, неоптимизированные `out/*.glb`, `renders/v2`, полный кэш звука (`wav/`, `build/`), все скриншоты/записи.

## 10. Известные проблемы
- Поздний бой: пауза восстановления 1.5–2.5 с перед следующим ударом.
- Удары работают только по стоящему парню (нет ударов по согнувшемуся/на коленях).
- «Камень-ножницы-бумага» (Рошамбо) из 2D не перенесён в 3D.
- Зеркало в зале показывает HDRI, а не сцену.
- Смещение парня (стаггер) не проверяется на стены.
- FPS на слабых ноутбуках не измерен.
- Голос Русаны — TTS (edge-tts ru-RU-SvetlanaNeural), нужен живой/лучший голос.
- CREDITS.md пишет «MakeHuman CC0», но одежда punkduck (sleeveless crop top, tennis shoes, running shoes) — **CC-BY** (нужна атрибуция: punkduck, makehumancommunity.org nodes 925/748/570).

## 11. Роадмап
- Костюмы за репутацию: базовый; зал — леггинсы+топ; клуб — платье+каблуки; крыша — кожанка+джинсовые шорты; лаборатория — белый халат поверх белья.
- 3D-модель Миры (захваты/удержания, удары предметами).
- Локации: клуб, крыша, лаборатория.
- Удары по согнувшемуся/стоящему на коленях парню.
- Навык прицеливания/тайминга вместо броска кубика (cleanChance).

## English summary
Three.js r169 browser game (no build step). `web/` = GitHub Pages site (deploy with `web/deploy.sh` → main). `pipeline/` = Blender 4.2.23 + MPFB 2.0.17 character/animation pipeline (`pipeline.py` build → `rigdump.py` → `rebuild_anim.sh` → `build_glb.sh` → `opt/*.glb` → `web/sync_assets.sh`). Scripts use absolute `/workspace/...` paths — relocate with sed. Used MakeHuman assets + licenses in `mpfb_assets_used/`. Characters, controls, fight rules, known gaps and roadmap are above (Russian).
