extends CharacterBody2D

const SPEED := 220.0

@onready var label: Label = $Label
@onready var interact_area: Area2D = $InteractArea

var can_move: bool = true
var nearby_npc: Node = null

func _ready() -> void:
	label.text = "Ты"
	add_to_group("player")
	interact_area.body_entered.connect(_on_body_entered)
	interact_area.body_exited.connect(_on_body_exited)
	interact_area.area_entered.connect(_on_area_entered)
	interact_area.area_exited.connect(_on_area_exited)

func _physics_process(_delta: float) -> void:
	if not can_move or GameState.encounter_active:
		velocity = Vector2.ZERO
		move_and_slide()
		return
	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = dir * SPEED
	move_and_slide()

func _unhandled_input(event: InputEvent) -> void:
	if GameState.encounter_active:
		return
	if event.is_action_pressed("interact") and nearby_npc != null:
		if nearby_npc.has_method("try_interact"):
			nearby_npc.try_interact()
		get_viewport().set_input_as_handled()

func set_movement_enabled(enabled: bool) -> void:
	can_move = enabled

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("npc"):
		nearby_npc = body
		if body.has_method("set_highlight"):
			body.set_highlight(true)

func _on_body_exited(body: Node) -> void:
	if body == nearby_npc:
		if body.has_method("set_highlight"):
			body.set_highlight(false)
		nearby_npc = null

func _on_area_entered(area: Area2D) -> void:
	var p := area.get_parent()
	if p and p.is_in_group("npc"):
		nearby_npc = p
		if p.has_method("set_highlight"):
			p.set_highlight(true)
	elif area.is_in_group("rest_zone"):
		GameState.emit_signal("toast_requested", "[E] Отдохнуть (+35 вын.)")
		nearby_npc = area
	elif area.is_in_group("door"):
		nearby_npc = area
		if area.has_method("hint"):
			GameState.emit_signal("toast_requested", area.hint())

func _on_area_exited(area: Area2D) -> void:
	if area == nearby_npc or (nearby_npc and area.get_parent() == nearby_npc):
		if nearby_npc and nearby_npc.has_method("set_highlight"):
			nearby_npc.set_highlight(false)
		nearby_npc = null
