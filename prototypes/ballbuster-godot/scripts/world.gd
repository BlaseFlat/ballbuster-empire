extends Node2D
## Procedural hub: Campus ↔ Gym ↔ Club with walls, NPCs, doors, rest spots.

@onready var player: CharacterBody2D = $Player
@onready var entities: Node2D = $Entities
@onready var area_label: Label = $UILayer/AreaLabel

var current_area: String = "campus"
var npc_scene: PackedScene

const WALL_COLOR := Color(0.12, 0.12, 0.18, 1)
const FLOOR_CAMPUS := Color(0.08, 0.09, 0.14, 1)
const FLOOR_GYM := Color(0.09, 0.11, 0.10, 1)
const FLOOR_CLUB := Color(0.12, 0.06, 0.10, 1)

func _ready() -> void:
	add_to_group("world")
	npc_scene = preload("res://scenes/npc.tscn")
	GameState.area_unlocked.connect(func(_a): _refresh_door_visuals())
	GameState.encounter_ended.connect(func(): _refresh_door_visuals())
	_build_world()
	_refresh_door_visuals()
	_update_area_label()
	set_process_unhandled_input(true)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		GameState.save_game()
		get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
		get_viewport().set_input_as_handled()

func teleport_player(pos: Vector2, area_id: String) -> void:
	player.global_position = pos
	current_area = area_id
	_update_area_label()
	GameState.emit_signal("toast_requested", "Локация: %s" % _name_of(area_id))
	GameState.save_game()

func _name_of(id: String) -> String:
	match id:
		"campus": return "Кампус"
		"gym": return "Спортзал"
		"club": return "Подпольный клуб"
		_: return id

func _update_area_label() -> void:
	area_label.text = "📍 " + _name_of(current_area) + "   |  Esc — меню/сохранить   WASD — ходьба   E — взаимодействие"

func _build_world() -> void:
	# --- CAMPUS (0..800 x 0..600) ---
	_add_floor(Rect2(0, 0, 800, 600), FLOOR_CAMPUS, "CampusFloor")
	_add_label(Vector2(400, 30), "КАМПУС", Color(0.88, 0.45, 0.55))
	_rect_walls([
		Rect2(0, 0, 800, 24), Rect2(0, 576, 800, 24),
		Rect2(0, 0, 24, 600), Rect2(776, 0, 24, 250), Rect2(776, 350, 24, 250),
		Rect2(200, 150, 120, 24), Rect2(450, 300, 24, 160), Rect2(100, 400, 180, 24)
	])
	_spawn_npc("artem", Vector2(280, 220))
	_spawn_npc("denis", Vector2(560, 420))
	_spawn_rest(Vector2(120, 100))
	_spawn_door(Vector2(790, 300), "gym", Vector2(860, 300), "Дверь заперта. Победи хотя бы одного — откроется Спортзал.", Color(0.55, 0.15, 0.2))

	# --- GYM (850..1650 x 0..600) ---
	_add_floor(Rect2(850, 0, 800, 600), FLOOR_GYM, "GymFloor")
	_add_label(Vector2(1250, 30), "СПОРТЗАЛ", Color(0.98, 0.65, 0.3))
	_rect_walls([
		Rect2(850, 0, 800, 24), Rect2(850, 576, 800, 24),
		Rect2(850, 0, 24, 250), Rect2(850, 350, 24, 250),
		Rect2(1626, 0, 24, 250), Rect2(1626, 350, 24, 250),
		Rect2(1000, 180, 200, 24), Rect2(1300, 350, 24, 140), Rect2(1100, 450, 160, 24)
	])
	_spawn_npc("maxim", Vector2(1100, 280))
	_spawn_npc("ilya", Vector2(1450, 400))
	_spawn_rest(Vector2(950, 100))
	_spawn_door(Vector2(860, 300), "campus", Vector2(740, 300), "", Color(0.2, 0.75, 0.4))
	_spawn_door(Vector2(1640, 300), "club", Vector2(1720, 300), "Дверь заперта. Нужно 3 трофея для клуба.", Color(0.55, 0.15, 0.2))

	# --- CLUB (1700..2500 x 0..600) ---
	_add_floor(Rect2(1700, 0, 800, 600), FLOOR_CLUB, "ClubFloor")
	_add_label(Vector2(2100, 30), "ПОДПОЛЬНЫЙ КЛУБ", Color(0.9, 0.3, 0.5))
	_rect_walls([
		Rect2(1700, 0, 800, 24), Rect2(1700, 576, 800, 24),
		Rect2(1700, 0, 24, 250), Rect2(1700, 350, 24, 250),
		Rect2(2476, 0, 24, 600),
		Rect2(1900, 200, 140, 24), Rect2(2150, 320, 24, 150)
	])
	_spawn_npc("roman", Vector2(1950, 350))
	_spawn_npc("victor", Vector2(2300, 280))
	_spawn_rest(Vector2(1800, 100))
	_spawn_door(Vector2(1710, 300), "gym", Vector2(1580, 300), "", Color(0.2, 0.75, 0.4))

	# Accent props
	_add_prop(Vector2(400, 500), Color(0.25, 0.2, 0.35), "скамейка")
	_add_prop(Vector2(1250, 150), Color(0.3, 0.25, 0.2), "штанга")
	_add_prop(Vector2(2100, 480), Color(0.4, 0.1, 0.2), "сцена")

func _add_floor(r: Rect2, col: Color, n: String) -> void:
	var cr := ColorRect.new()
	cr.name = n
	cr.position = r.position
	cr.size = r.size
	cr.color = col
	cr.z_index = -10
	entities.add_child(cr)

func _add_label(pos: Vector2, text: String, col: Color) -> void:
	var l := Label.new()
	l.text = text
	l.position = pos - Vector2(80, 0)
	l.add_theme_color_override("font_color", col)
	l.add_theme_font_size_override("font_size", 22)
	entities.add_child(l)

func _add_prop(pos: Vector2, col: Color, tag: String) -> void:
	var cr := ColorRect.new()
	cr.position = pos
	cr.size = Vector2(60, 20)
	cr.color = col
	entities.add_child(cr)
	var l := Label.new()
	l.text = tag
	l.position = pos + Vector2(0, -18)
	l.add_theme_font_size_override("font_size", 11)
	l.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	entities.add_child(l)

func _rect_walls(rects: Array) -> void:
	for r in rects:
		_add_wall(r)

func _add_wall(r: Rect2) -> void:
	var body := StaticBody2D.new()
	body.position = r.position + r.size * 0.5
	body.collision_layer = 1
	body.collision_mask = 0
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = r.size
	shape.shape = rect
	body.add_child(shape)
	var vis := ColorRect.new()
	vis.size = r.size
	vis.position = -r.size * 0.5
	vis.color = WALL_COLOR
	body.add_child(vis)
	# pink edge accent
	var edge := ColorRect.new()
	edge.size = Vector2(r.size.x, 2)
	edge.position = Vector2(-r.size.x * 0.5, -r.size.y * 0.5)
	edge.color = Color(0.88, 0.11, 0.28, 0.5)
	body.add_child(edge)
	entities.add_child(body)

func _spawn_npc(id: String, pos: Vector2) -> void:
	var n: CharacterBody2D = npc_scene.instantiate()
	n.npc_id = id
	n.global_position = pos
	entities.add_child(n)

func _spawn_rest(pos: Vector2) -> void:
	var area := Area2D.new()
	area.set_script(load("res://scripts/rest_zone.gd"))
	area.position = pos
	area.collision_layer = 4
	area.collision_mask = 0
	var cs := CollisionShape2D.new()
	var circ := CircleShape2D.new()
	circ.radius = 36
	cs.shape = circ
	area.add_child(cs)
	var vis := ColorRect.new()
	vis.size = Vector2(48, 48)
	vis.position = Vector2(-24, -24)
	vis.color = Color(0.15, 0.45, 0.35, 0.7)
	area.add_child(vis)
	var l := Label.new()
	l.text = "Отдых"
	l.position = Vector2(-22, -40)
	l.add_theme_font_size_override("font_size", 12)
	l.add_theme_color_override("font_color", Color(0.4, 0.9, 0.7))
	area.add_child(l)
	entities.add_child(area)

func _spawn_door(pos: Vector2, target: String, spawn_pos: Vector2, locked_msg: String, col: Color) -> void:
	var area := Area2D.new()
	area.set_script(load("res://scripts/door_zone.gd"))
	area.position = pos
	area.target_area = target
	area.locked_message = locked_msg if locked_msg != "" else "Закрыто."
	area.set_meta("spawn_pos", spawn_pos)
	area.collision_layer = 4
	area.collision_mask = 0
	area.add_to_group("door")
	# Override try_interact via meta + custom callable by extending behavior in door script
	# We'll use a custom door that reads meta spawn_pos
	var cs := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(40, 80)
	cs.shape = rect
	area.add_child(cs)
	var vis := ColorRect.new()
	vis.name = "Visual"
	vis.size = Vector2(28, 70)
	vis.position = Vector2(-14, -35)
	vis.color = col
	area.add_child(vis)
	var l := Label.new()
	l.name = "DoorLabel"
	l.text = "▶"
	l.position = Vector2(-8, -10)
	l.add_theme_font_size_override("font_size", 18)
	area.add_child(l)
	area.set_meta("is_world_door", true)
	entities.add_child(area)
	# Monkey-patch: connect to use spawn from meta
	if not area.has_meta("_patched"):
		area.set_meta("_patched", true)

func _refresh_door_visuals() -> void:
	for child in entities.get_children():
		if child is Area2D and child.is_in_group("door"):
			var target: String = str(child.get("target_area"))
			var vis: ColorRect = child.get_node_or_null("Visual")
			if vis == null:
				continue
			var open := false
			if target == "campus":
				open = true
			else:
				open = GameState.areas_unlocked.has(target)
			vis.color = Color(0.2, 0.75, 0.4, 0.85) if open else Color(0.55, 0.15, 0.2, 0.85)
