extends Control

func _ready() -> void:
	var button := Button.new()
	button.text = "Godot smoke"
	button.icon = preload("res://icon.svg")
	button.position = Vector2(20, 20)
	button.size = Vector2(200, 80)
	button.pressed.connect(func():
		button.text = "Clicked"
		if OS.has_feature("web"):
			JavaScriptBridge.eval("window.godotSmokeClicked = true")
	)
	add_child(button)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.godotSmokeReady = true")
