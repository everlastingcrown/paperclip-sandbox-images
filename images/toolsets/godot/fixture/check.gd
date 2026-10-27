extends SceneTree

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var file := FileAccess.open("user://smoke.txt", FileAccess.WRITE)
	assert(file != null)
	file.store_string("godot")
	file.close()
	assert(FileAccess.get_file_as_string("user://smoke.txt") == "godot")
	var server := WebSocketMultiplayerPeer.new()
	assert(server.create_server(18473, "127.0.0.1") == OK)
	var client := WebSocketMultiplayerPeer.new()
	assert(client.create_client("ws://127.0.0.1:18473") == OK)
	var deadline := Time.get_ticks_msec() + 5000
	var sent := false
	while Time.get_ticks_msec() < deadline:
		server.poll()
		client.poll()
		if not sent and client.get_connection_status() == MultiplayerPeer.CONNECTION_CONNECTED:
			client.set_target_peer(1)
			assert(client.put_packet("smoke".to_utf8_buffer()) == OK)
			sent = true
		if server.get_available_packet_count() > 0:
			assert(server.get_packet().get_string_from_utf8() == "smoke")
			client.close()
			server.close()
			print("GODOT_CHECK_PASSED")
			quit(0)
			return
		await process_frame
	printerr("WebSocket smoke timed out")
	quit(1)
