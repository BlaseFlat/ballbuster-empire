extends Area2D

@export var target_area: String = "gym"
@export var spawn_marker_path: NodePath
@export var locked_message: String = "Дверь заперта. Нужен ещё трофей."

func _ready() -> void:
	add_to_group("door")
	monitoring = true
	collision_layer = 4
	collision_mask = 0

func hint() -> String:
	if _is_open():
		return "[E] Войти: %s" % _area_name()
	return locked_message

func _is_open() -> bool:
	# Always allow returning to a previous hub you've already left
	if target_area == "campus":
		return true
	# Forward doors require unlock
	return GameState.areas_unlocked.has(target_area)

func _area_name() -> String:
	match target_area:
		"gym": return "Спортзал"
		"club": return "Подпольный клуб"
		"campus": return "Кампус"
		_: return target_area

func try_interact() -> void:
	if not _is_open():
		GameState.emit_signal("toast_requested", locked_message)
		return
	var world := get_tree().get_first_node_in_group("world")
	if world == null:
		return
	var spawn := Vector2.ZERO
	if has_meta("spawn_pos"):
		spawn = get_meta("spawn_pos")
	elif spawn_marker_path != NodePath(""):
		var marker := get_node_or_null(spawn_marker_path)
		if marker:
			spawn = marker.global_position
	if world.has_method("teleport_player"):
		world.teleport_player(spawn, target_area)
