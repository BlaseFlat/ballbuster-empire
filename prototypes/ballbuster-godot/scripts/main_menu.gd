extends Control

@onready var continue_btn: Button = $Center/VBox/ContinueBtn
@onready var about_panel: PanelContainer = $AboutPanel
@onready var path_panel: PanelContainer = $PathPanel

func _ready() -> void:
	about_panel.visible = false
	path_panel.visible = false
	continue_btn.disabled = not GameState.has_save()
	$Center/VBox/NewBtn.pressed.connect(_on_new)
	continue_btn.pressed.connect(_on_continue)
	$Center/VBox/AboutBtn.pressed.connect(func(): about_panel.visible = true)
	$Center/VBox/ResetBtn.pressed.connect(_on_reset)
	$AboutPanel/Margin/VBox/BackBtn.pressed.connect(func(): about_panel.visible = false)
	$PathPanel/Margin/VBox/PublicBtn.pressed.connect(func(): _start_with_path("public"))
	$PathPanel/Margin/VBox/PrivateBtn.pressed.connect(func(): _start_with_path("private"))

func _on_new() -> void:
	GameState.default_reset()
	path_panel.visible = true

func _start_with_path(p: String) -> void:
	GameState.choose_path(p)
	get_tree().change_scene_to_file("res://scenes/world.tscn")

func _on_continue() -> void:
	if GameState.load_game():
		get_tree().change_scene_to_file("res://scenes/world.tscn")
	else:
		continue_btn.disabled = true

func _on_reset() -> void:
	GameState.delete_save()
	continue_btn.disabled = true
