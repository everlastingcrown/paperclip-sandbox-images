extends SceneTree

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var file := FileAccess.open("user://smoke.txt", FileAccess.WRITE)
	assert(file != null)
	file.store_string("godot")
	file.close()
	assert(FileAccess.get_file_as_string("user://smoke.txt") == "godot")
	var listener := TCPServer.new()
	assert(listener.listen(0, "127.0.0.1") == OK)
	print("WebSocket smoke listening on 127.0.0.1:%d" % listener.get_local_port())
	var server := WebSocketPeer.new()
	var client := WebSocketPeer.new()
	assert(client.connect_to_url("ws://127.0.0.1:%d" % listener.get_local_port()) == OK)
	var accepted := false
	var deadline := Time.get_ticks_msec() + 5000
	var sent := false
	while Time.get_ticks_msec() < deadline:
		if not accepted and listener.is_connection_available():
			assert(server.accept_stream(listener.take_connection()) == OK)
			accepted = true
		if accepted:
			server.poll()
		client.poll()
		if not sent and client.get_ready_state() == WebSocketPeer.STATE_OPEN:
			assert(client.send_text("smoke") == OK)
			sent = true
		if server.get_available_packet_count() > 0:
			assert(server.get_packet().get_string_from_utf8() == "smoke")
			client.close()
			server.close()
			listener.stop()
			print("GODOT_CHECK_PASSED")
			quit(0)
			return
		await process_frame
	printerr("WebSocket smoke timed out")
	quit(1)
