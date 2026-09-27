extends Node
## Autoload: player stats, save/load, unlocks, encounter hooks.

signal stats_changed
signal toast_requested(msg: String)
signal encounter_started(npc_id: String)
signal encounter_ended
signal area_unlocked(area_id: String)

const SAVE_PATH := "user://ballbuster_save.cfg"

var cruelty: int = 5
var reputation: int = 0
var stamina: int = 100
var max_stamina: int = 100
var trophies: int = 0
var chapter: int = 1
var path: String = "public"  # public | private
var path_chosen: bool = false
var areas_unlocked: Array = ["campus"]
var npc_state: Dictionary = {}  # id -> {fought, ending, damage_done, folded}
var journal: Array = []
var encounter_active: bool = false
var current_npc_id: String = ""

func _ready() -> void:
	randomize()

func default_reset() -> void:
	cruelty = 5
	reputation = 0
	stamina = 100
	max_stamina = 100
	trophies = 0
	chapter = 1
	path = "public"
	path_chosen = false
	areas_unlocked = ["campus"]
	npc_state = {}
	journal = []
	encounter_active = false
	current_npc_id = ""
	emit_signal("stats_changed")

func ensure_npc(id: String) -> Dictionary:
	if not npc_state.has(id):
		npc_state[id] = {"fought": false, "ending": "", "damage_done": 0, "folded": false, "rounds": 0}
	return npc_state[id]

func is_npc_folded(id: String) -> bool:
	return ensure_npc(id).get("folded", false)

func choose_path(p: String) -> void:
	path = p
	path_chosen = true
	if p == "public":
		reputation += 5
	else:
		cruelty += 5
	emit_signal("stats_changed")
	save_game()

func clampi_range(n: int, a: int, b: int) -> int:
	return clampi(n, a, b)

func rest(amount: int = 35) -> void:
	stamina = clampi_range(stamina + amount, 0, max_stamina)
	emit_signal("stats_changed")
	emit_signal("toast_requested", "Выносливость восстановлена (+%d)." % amount)
	save_game()

func check_unlocks() -> void:
	# Gym after 1 trophy
	if trophies >= 1 and not areas_unlocked.has("gym"):
		areas_unlocked.append("gym")
		emit_signal("area_unlocked", "gym")
		emit_signal("toast_requested", "Открыт Спортзал! Дверь на востоке разблокирована.")
	# Club after 3 trophies
	if trophies >= 3 and not areas_unlocked.has("club"):
		areas_unlocked.append("club")
		emit_signal("area_unlocked", "club")
		emit_signal("toast_requested", "Открыт Подпольный клуб!")
	if trophies >= 2 and chapter < 2:
		chapter = 2
		emit_signal("toast_requested", "Глава 2 началась.")
	if trophies >= 4 and chapter < 3:
		chapter = 3
		emit_signal("toast_requested", "Глава 3 началась.")
	emit_signal("stats_changed")

func on_npc_defeated(npc_id: String, ending: String, end_text: String) -> void:
	var st := ensure_npc(npc_id)
	st["fought"] = true
	st["folded"] = true
	st["ending"] = ending
	trophies += 1
	reputation += 8 if path == "public" else 4
	cruelty += 3
	max_stamina = mini(140, max_stamina + 3)
	stamina = clampi_range(stamina + 15, 0, max_stamina)
	journal.append({"npc": NpcData.NPCS[npc_id]["name"], "ending": ending, "note": end_text})
	check_unlocks()
	save_game()
	emit_signal("stats_changed")

func save_game() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("player", "cruelty", cruelty)
	cfg.set_value("player", "reputation", reputation)
	cfg.set_value("player", "stamina", stamina)
	cfg.set_value("player", "max_stamina", max_stamina)
	cfg.set_value("player", "trophies", trophies)
	cfg.set_value("player", "chapter", chapter)
	cfg.set_value("player", "path", path)
	cfg.set_value("player", "path_chosen", path_chosen)
	cfg.set_value("player", "areas_unlocked", areas_unlocked)
	cfg.set_value("player", "npc_state", npc_state)
	cfg.set_value("player", "journal", journal)
	cfg.save(SAVE_PATH)

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

func load_game() -> bool:
	if not has_save():
		return false
	var cfg := ConfigFile.new()
	var err := cfg.load(SAVE_PATH)
	if err != OK:
		return false
	cruelty = int(cfg.get_value("player", "cruelty", 5))
	reputation = int(cfg.get_value("player", "reputation", 0))
	stamina = int(cfg.get_value("player", "stamina", 100))
	max_stamina = int(cfg.get_value("player", "max_stamina", 100))
	trophies = int(cfg.get_value("player", "trophies", 0))
	chapter = int(cfg.get_value("player", "chapter", 1))
	path = str(cfg.get_value("player", "path", "public"))
	path_chosen = bool(cfg.get_value("player", "path_chosen", false))
	areas_unlocked = cfg.get_value("player", "areas_unlocked", ["campus"])
	npc_state = cfg.get_value("player", "npc_state", {})
	journal = cfg.get_value("player", "journal", [])
	emit_signal("stats_changed")
	return true

func delete_save() -> void:
	if has_save():
		DirAccess.remove_absolute(SAVE_PATH)
	default_reset()
