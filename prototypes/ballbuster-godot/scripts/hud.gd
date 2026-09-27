extends CanvasLayer

@onready var cruelty_l: Label = $Bar/HBox/Cruelty
@onready var rep_l: Label = $Bar/HBox/Rep
@onready var stam_l: Label = $Bar/HBox/Stam
@onready var trophy_l: Label = $Bar/HBox/Trophy
@onready var toast_l: Label = $Toast
@onready var hint_l: Label = $Hint

var toast_timer: float = 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameState.stats_changed.connect(_refresh)
	GameState.toast_requested.connect(_on_toast)
	toast_l.visible = false
	_refresh()

func _process(delta: float) -> void:
	if toast_timer > 0.0:
		toast_timer -= delta
		if toast_timer <= 0.0:
			toast_l.visible = false

func _refresh() -> void:
	cruelty_l.text = "Жестокость: %d" % GameState.cruelty
	rep_l.text = "Репутация: %d" % GameState.reputation
	stam_l.text = "Выносливость: %d/%d" % [GameState.stamina, GameState.max_stamina]
	trophy_l.text = "Трофеи: %d" % GameState.trophies

func _on_toast(msg: String) -> void:
	toast_l.text = msg
	toast_l.visible = true
	toast_timer = 2.8
