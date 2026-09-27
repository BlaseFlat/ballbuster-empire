extends CanvasLayer
## Overlay encounter UI: approaches, strikes, graphic Russian reactions.

@onready var panel: PanelContainer = $Panel
@onready var title_label: Label = $Panel/Margin/VBox/Title
@onready var sub_label: Label = $Panel/Margin/VBox/Sub
@onready var hp_bar: ProgressBar = $Panel/Margin/VBox/HpBar
@onready var stam_label: Label = $Panel/Margin/VBox/StamLabel
@onready var log_box: RichTextLabel = $Panel/Margin/VBox/Log
@onready var choices: VBoxContainer = $Panel/Margin/VBox/Choices

var enc: Dictionary = {}
var over: bool = false

func _ready() -> void:
	visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameState.encounter_started.connect(_on_encounter_started)

func _on_encounter_started(npc_id: String) -> void:
	start_encounter(npc_id)

func start_encounter(npc_id: String) -> void:
	var data: Dictionary = NpcData.get_npc(npc_id)
	if data.is_empty():
		return
	var st: Dictionary = GameState.ensure_npc(npc_id)
	var base_hp: int = int(data["resistance"])
	var dmg_done: int = int(st.get("damage_done", 0))
	enc = {
		"npc_id": npc_id,
		"hp": maxi(20, base_hp - int(dmg_done * 0.3)),
		"max_hp": base_hp,
		"approach": "",
		"round": 0
	}
	over = false
	GameState.encounter_active = true
	GameState.current_npc_id = npc_id
	visible = true
	get_tree().paused = true
	title_label.text = "Стычка: %s" % data["name"]
	sub_label.text = str(data["bio"])
	log_box.clear()
	_update_bars()
	_show_approaches()
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_method("set_movement_enabled"):
		player.set_movement_enabled(false)

func _update_bars() -> void:
	var pct := 100.0
	if enc.get("max_hp", 1) > 0:
		pct = clampf(100.0 * float(enc["hp"]) / float(enc["max_hp"]), 0.0, 100.0)
	hp_bar.value = pct
	stam_label.text = "Стойкость жертвы: %d%% · Твоя выносливость: %d" % [int(pct), GameState.stamina]

func _clear_choices() -> void:
	for c in choices.get_children():
		c.queue_free()

func _add_btn(text: String, cb: Callable, disabled: bool = false, style: String = "normal") -> void:
	var b := Button.new()
	b.text = text
	b.disabled = disabled
	b.custom_minimum_size = Vector2(0, 36)
	match style:
		"ghost":
			b.modulate = Color(0.75, 0.75, 0.8)
		"gold":
			b.modulate = Color(1.0, 0.85, 0.4)
	b.pressed.connect(cb)
	choices.add_child(b)

func _log(text: String, color: String = "hurt") -> void:
	var col := "#fb7185"
	match color:
		"dom": col = "#a78bfa"
		"plea": col = "#fbbf24"
		"sys": col = "#9ca3af"
		"hurt": col = "#fb7185"
	log_box.append_text("[color=%s]%s[/color]\n\n" % [col, text])

func _show_approaches() -> void:
	_clear_choices()
	var hint := Label.new()
	hint.text = "Выбери подход:"
	hint.modulate = Color(0.7, 0.7, 0.75)
	choices.add_child(hint)
	_add_btn("Провокация — дразнишь, пока он не потеряет осторожность", func(): _select_approach("provoke"))
	_add_btn("Вызов — открытый вызов (+5 урона, −5 вын.)", func(): _select_approach("challenge"))
	_add_btn("Внезапный удар — без предупреждения (+15 шок, −10 вын.)", func(): _select_approach("surprise"))
	_add_btn("Уйти", func(): _abort(), false, "ghost")

func _select_approach(id: String) -> void:
	enc["approach"] = id
	var npc: Dictionary = NpcData.get_npc(enc["npc_id"])
	var name: String = npc["name"]
	match id:
		"provoke":
			_log("Ты подходишь к %sу вплотную, улыбаясь слишком сладко. «Слышала, у тебя стальные яйца? Интересно проверить.» Он смеётся — пока ты не смотришь вниз, на его пах, слишком долго и слишком голодно." % name, "dom")
		"challenge":
			GameState.stamina = GameState.clampi_range(GameState.stamina - 5, 0, GameState.max_stamina)
			_log("«Эй. Пах. Сейчас.» Голос холодный. %s бледнеет, но пытается держаться. Ты медленно поднимаешь колено, демонстрируя цель." % name, "dom")
		"surprise":
			GameState.stamina = GameState.clampi_range(GameState.stamina - 10, 0, GameState.max_stamina)
			var chip := 8 + int(GameState.cruelty / 10)
			enc["hp"] = maxi(0, int(enc["hp"]) - chip)
			_log("Без слова. Шаг. Разворот бёдер. Носок врезается в мячик справа раньше, чем он успевает вдохнуть. Воздух вышибает из лёгких. Глаза лезут на лоб.", "dom")
			_log("Внезапный удар уже отнял у него силу (−%d)." % chip, "sys")
	GameState.emit_signal("stats_changed")
	_update_bars()
	_show_strikes()

func _show_strikes() -> void:
	_clear_choices()
	var hint := Label.new()
	hint.text = "Стиль удара:"
	hint.modulate = Color(0.7, 0.7, 0.75)
	choices.add_child(hint)
	for key in ["toe", "knee", "heel", "combo"]:
		var s: Dictionary = NpcData.STRIKES[key]
		var can := GameState.stamina >= int(s["stam"])
		var t := "%s (−%d вын., урон ~%d–%d)" % [s["name"], s["stam"], s["dmg_min"], s["dmg_max"]]
		_add_btn(t, _make_strike_cb(key), not can)
	_add_btn("Остановить / Уйти", func(): _abort(), false, "ghost")

func _make_strike_cb(key: String) -> Callable:
	return func(): _do_strike(key)

func _randi_range(a: int, b: int) -> int:
	return a + randi() % (b - a + 1)

func _pick(arr: Array) -> Variant:
	return arr[randi() % arr.size()]

func _do_strike(strike_id: String) -> void:
	if over:
		return
	var s: Dictionary = NpcData.STRIKES[strike_id]
	var npc: Dictionary = NpcData.get_npc(enc["npc_id"])
	var st: Dictionary = GameState.ensure_npc(enc["npc_id"])
	if GameState.stamina < int(s["stam"]):
		GameState.emit_signal("toast_requested", "Не хватает выносливости.")
		return
	GameState.stamina -= int(s["stam"])
	enc["round"] = int(enc["round"]) + 1
	st["rounds"] = int(st.get("rounds", 0)) + 1

	var dmg := _randi_range(int(s["dmg_min"]), int(s["dmg_max"]))
	if enc["approach"] == "surprise" and int(enc["round"]) == 1:
		dmg += 15
	if enc["approach"] == "challenge":
		dmg += 5
	dmg += int(GameState.cruelty / 8)
	if GameState.path == "private" and (strike_id == "combo" or strike_id == "heel"):
		dmg += 6
	if GameState.path == "public" and int(enc["round"]) <= 2:
		dmg += 4

	enc["hp"] = maxi(0, int(enc["hp"]) - dmg)
	st["damage_done"] = int(st.get("damage_done", 0)) + dmg
	GameState.cruelty += int(s["cruel"])
	if GameState.path == "public":
		GameState.reputation += 1
	elif strike_id == "heel" or strike_id == "combo":
		GameState.cruelty += 1

	var hp_ratio := float(enc["hp"]) / float(enc["max_hp"])
	var reaction := _build_reaction(npc, s, dmg, hp_ratio)
	_log(reaction["hit"], "hurt")
	_log(reaction["body"], "hurt")
	if reaction["plea"] != "":
		_log(reaction["plea"], "plea")
	if reaction["crowd"] != "":
		_log(reaction["crowd"], "sys")

	GameState.emit_signal("stats_changed")
	_update_bars()

	if int(enc["hp"]) <= 0 or hp_ratio <= 0.15:
		_finish()
		return
	if GameState.stamina < 8:
		_log("Ты тяжело дышишь. Выносливость на нуле — пора отступить.", "sys")
	_show_strikes()
	GameState.save_game()

func _build_reaction(npc: Dictionary, strike: Dictionary, dmg: int, hp_ratio: float) -> Dictionary:
	var name: String = npc["name"]
	var style: String = strike["text"]
	var hard := GameState.cruelty >= 40
	var mid := hp_ratio < 0.55
	var low := hp_ratio < 0.3

	var hits: Array = [
		"Ты бьёшь %s точно в центр мошонки. Удар глухой, влажный, отвратительно правильный." % style,
		"%s врезается в яйца %sа. Мягкая плоть плющится между костью и бедром." % [style.capitalize(), name],
		"Цель поймана. %s входит снизу вверх, поднимая яйца и разнося боль по всему животу." % style.capitalize()
	]
	if strike["id"] == "heel":
		hits.append("Каблук впивается в одно яйцо, проворачиваясь. Хрящик жалобно протестует под тонкой кожей.")
	if strike["id"] == "combo":
		hits.append("Серия: носок — колено — снова носок. Пах превращается в пульсирующее месиво.")
	if strike["id"] == "knee":
		hits.append("Колено входит как таран. Оба яйца сжимаются одновременно — идеальный double-crush.")

	var body := ""
	if hp_ratio > 0.7:
		body = "%s всхлипывает, глаза округляются. Руки инстинктивно летят к паху, но уже поздно — боль волной поднимается в живот. Колени подгибаются." % name
	elif not mid:
		body = "%s складывается пополам, издавая высокий сдавленный вой. Лицо багровеет. Изо рта течёт слюна. Он пытается дышать — получается только хрип." % name
	elif not low:
		body = "%s падает на колени. Слёзы текут без спроса. Он блюёт желчью рядом с твоими ногами, всё ещё прижимая дрожащие ладони к уничтоженным яйцам." % name
		if hard:
			body += " Ты ставишь ногу ему на запястье, чтобы он не закрывался, и смотришь, как пах дергается от агонии."
	else:
		body = "%s лежит клубочком, бёдра в судороге, яйца опухшие и багровые. Он больше не кричит — только всхлипывает. Гордость вытекла вместе со слёзами." % name
		if hard:
			body += " Ты легко касаешься носком его мошонки — он взвизгивает, как животное."

	var plea := ""
	var pleas := [
		"«Пожалуйста… хватит… яйца… я больше не могу…»",
		"«Не надо… прошу… сломаешь… я сделаю что угодно…»",
		"«Госпожа… прости… пах горит… умоляю…»",
		"«Перестань… люди видят… мне стыдно… больно…»"
	]
	if mid or dmg > 30:
		plea = "%s: %s" % [name, _pick(pleas)]

	var crowd := ""
	if GameState.path == "public":
		crowd = str(_pick([
			"Кто-то улюлюкает. Телефон уже снимает.",
			"Девушки хихикают. Парни инстинктивно сжимают бёдра.",
			"Шёпот: «Это она. Боллбастерша.»"
		]))

	return {
		"hit": "%s [−%d]" % [_pick(hits), dmg],
		"body": body,
		"plea": plea,
		"crowd": crowd
	}

func _abort() -> void:
	if not enc.is_empty():
		var st := GameState.ensure_npc(enc["npc_id"])
		st["fought"] = true
		st["damage_done"] = int(st.get("damage_done", 0)) + (int(enc["max_hp"]) - int(enc["hp"]))
		_log("Ты отступаешь, оставляя его корчиться. Вернёшься — добьёшь.", "sys")
	over = true
	GameState.save_game()
	_clear_choices()
	_add_btn("На карту", func(): _close())

func _finish() -> void:
	over = true
	var npc: Dictionary = NpcData.get_npc(enc["npc_id"])
	var ending := "broken"
	if GameState.path == "public" and GameState.reputation >= 25:
		ending = "ruined"
	elif GameState.cruelty >= 50 or int(enc["round"]) >= 5:
		ending = "submitted"
	elif GameState.path == "private" and GameState.cruelty >= 30:
		ending = "submitted"
	elif randf() < 0.33:
		ending = str(_pick(["broken", "submitted", "ruined"]))

	var end_text: String = npc["endings"].get(ending, "")
	GameState.on_npc_defeated(enc["npc_id"], ending, end_text)
	_log("[b]%s сломлен.[/b] %s" % [npc["name"], end_text], "dom")
	_log("Трофей получен. Жестокость и репутация выросли.", "sys")
	_clear_choices()
	_add_btn("Продолжить", func(): _close(), false, "gold")

func _close() -> void:
	visible = false
	GameState.encounter_active = false
	GameState.current_npc_id = ""
	get_tree().paused = false
	var player := get_tree().get_first_node_in_group("player")
	if player and player.has_method("set_movement_enabled"):
		player.set_movement_enabled(true)
	GameState.encounter_ended.emit()
	GameState.emit_signal("stats_changed")
