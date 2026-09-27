extends Area2D

func _ready() -> void:
	add_to_group("rest_zone")

func try_interact() -> void:
	GameState.rest(35)
