extends CharacterBody2D

@export var npc_id: String = "artem"

@onready var body_poly: Polygon2D = $Body
@onready var label: Label = $Label
@onready var prompt: Label = $Prompt
@onready var highlight: Polygon2D = $Highlight

var data: Dictionary = {}

func _ready() -> void:
	add_to_group("npc")
	data = NpcData.get_npc(npc_id)
	if data.is_empty():
		label.text = npc_id
		return
	label.text = data["name"]
	body_poly.color = data.get("color", Color(0.5, 0.5, 0.8))
	prompt.visible = false
	highlight.visible = false
	_refresh_folded_look()
	GameState.stats_changed.connect(_refresh_folded_look)

func _refresh_folded_look() -> void:
	if GameState.is_npc_folded(npc_id):
		body_poly.color = Color(0.35, 0.35, 0.4)
		label.text = data.get("name", npc_id) + " ✕"
		modulate = Color(0.7, 0.7, 0.7, 0.85)

func set_highlight(on: bool) -> void:
	prompt.visible = on and not GameState.is_npc_folded(npc_id)
	highlight.visible = on
	if on and GameState.is_npc_folded(npc_id):
		prompt.text = "Трофей добыт"
		prompt.visible = true
	elif on:
		prompt.text = "[E] Стычка"

func try_interact() -> void:
	if GameState.encounter_active:
		return
	if GameState.is_npc_folded(npc_id):
		GameState.emit_signal("toast_requested", "%s уже сломлен." % data.get("name", npc_id))
		return
	if GameState.stamina < 10:
		GameState.emit_signal("toast_requested", "Мало выносливости. Отдохни у скамейки.")
		return
	GameState.encounter_started.emit(npc_id)
