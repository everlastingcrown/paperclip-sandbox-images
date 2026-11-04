extends SceneTree

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	if DisplayServer.get_name().to_lower() != "x11":
		printerr("Native smoke requires the X11 display driver")
		quit(1)
		return
	var scene: Node = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if image.is_empty() or image.save_png("res://native.png") != OK:
		printerr("Native viewport capture failed")
		quit(1)
		return
	print("GODOT_NATIVE_CHECK_PASSED")
	quit(0)
