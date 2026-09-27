# Боллбастер: Империя паха (Godot 4.3)

Top-down 2D adult fetish (ballbusting) game. Russian UI. All characters 21+.

## Run (editor / project)

```bash
/workspace/tools/godot --path /workspace/ballbuster-godot
```

Headless smoke:

```bash
/workspace/tools/godot --headless --path /workspace/ballbuster-godot --quit-after 3
```

## Standalone Linux binary

```bash
/workspace/ballbuster-godot/build/Ballbuster.x86_64
```

(PCK is embedded.)

## Web export

Serve `build/web/` over HTTP (WASM needs a web server):

```bash
cd /workspace/ballbuster-godot/build/web && python3 -m http.server 8080
```

## Controls

- **WASD / Arrows** — walk
- **E** — interact (NPC encounter, door, rest bench)
- **Esc** — save & return to main menu

## Progression

1. **Кампус** — Артём, Денис
2. Defeat ≥1 NPC → unlock **Спортзал** (east door) — Максим, Илья
3. Defeat ≥3 NPCs → unlock **Подпольный клуб** — Роман, Виктор

## Scenes

- `scenes/main_menu.tscn` — menu, path choice, save
- `scenes/world.tscn` — hub map (3 areas)
- `scenes/player.tscn`, `scenes/npc.tscn`
- `scenes/ui/hud.tscn`, `scenes/ui/encounter_ui.tscn`

## Save

`user://ballbuster_save.cfg` (ConfigFile)
