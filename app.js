var net = require('net');
var uuid = require('node-uuid');
var ProtoBuf = require('protobufjs');

/*************************************************************************************************/
// CONSTANTS

// TCP Commands
var COMMANDS = {
	HeartbeatRequest:                  0x01,
	HeartbeatResponse:                 0x02,

	Ping:                              0x03,
	Pong:                              0x04,

	// ...

	Read:                              0xB0,
    ReadEventCompleted:                0xB1,
    ReadStreamEventsForward:           0xB2,
    ReadStreamEventsForwardCompleted:  0xB3,
    ReadStreamEventsBackward:          0xB4,
    ReadStreamEventsBackwardCompleted: 0xB5,
    ReadAllEventsForward:              0xB6,
    ReadAllEventsForwardCompleted:     0xB7,
    ReadAllEventsBackward:             0xB8,
    ReadAllEventsBackwardCompleted:    0xB9,

	SubscribeToStream:                 0xC0,
    SubscriptionConfirmation:          0xC1,
    StreamEventAppeared:               0xC2,
    UnsubscribeFromStream:             0xC3,
    SubscriptionDropped:               0xC4,

    // ...
    BadRequest:                        0xF0,
    NotHandled:                        0xF1,
    Authenticate:                      0xF2,
    Authenticated:                     0xF3,
    NotAuthenticated:                  0xF4
}

// TCP Flags
var FLAGS_NONE             = 0x00;
var FLAGS_AUTH             = 0x01;

var UINT32_LENGTH          = 4;
var GUID_LENGTH            = 16;
var HEADER_LENGTH          = 1 + 1 + GUID_LENGTH; // Cmd + Flags + CorrelationId

var COMMAND_OFFSET         = UINT32_LENGTH;
var FLAGS_OFFSET           = COMMAND_OFFSET + 1;
var CORRELATION_ID_OFFSET  = FLAGS_OFFSET + 1;
var DATA_OFFSET            = CORRELATION_ID_OFFSET + GUID_LENGTH; // Length + Cmd + Flags + CorrelationId

/*************************************************************************************************/
// CONFIGURATION

var options = {
	host: '127.0.0.1',
	port: 1113
};
var debug = true;

/*************************************************************************************************/
var builder = ProtoBuf.loadProtoFile('ClientMessageDtos.proto');
var EventStore = builder.build();
var Messages = EventStore.EventStore.Client.Messages;

var callbacks = {
};

var currentOffset = 0;
var currentMessage = null;
console.log('Connecting to ' + options.host + ':' + options.port + '...');
var connection = net.connect(options, function() {
	connection.on('error', function(err) {
		console.error(err);
		connection.end();
	});

	connection.on('data', function(data) {
		if (currentMessage == null) {
			// Read the command length
			var commandLength = data.readUInt32LE(0);
			if (commandLength < HEADER_LENGTH) {
				console.error('Invalid command length of ' + commandLength + ' bytes. Needs to be at least big enough for the header')
				connection.close();
			}

			// The entire message will include the command length at the start
			var messageLength = UINT32_LENGTH + commandLength;
			if (data.length == messageLength) {
				// A single packet message, no need to copy into another buffer
				receiveMessage(data);
			} else if (data.length > messageLength) {
				console.error("FIXME: Accept multiple messages in the same packet");
				connection.end();
			} else {
				// The first packet of a multi-packet message
				currentMessage = new Buffer(messageLength);
				var packetLength = data.copy(currentMessage, currentOffset, 0);
				currentOffset = packetLength;
			}
		} else {
			// Another packet for a multi-packet message
			var packetLength = data.copy(currentMessage, currentOffset, 0);
			currentOffset += packetLength;
			if (currentOffset >= currentMessage.length) {
				console.log("Finished receiving");
				receiveMessage(currentMessage);
				currentMessage = null;
				currentOffset = 0;
			}
		}
	});

	
	console.log('Connected');

	var streamId = '$stats-127.0.0.1:2113'; // 'chat-GeneralChat';
	console.log('Subscribing to ' + streamId + "...")
	subscribeToStream(streamId, true, function(streamEvent) {
		console.log(streamEvent);
	}, {
		username: "admin",
		password: "changeit"
	});

	function sendPing() {
		sendMessage(COMMANDS.Ping, null, null, function(pkg) {
			console.log('Received ' + getCommandName(pkg.command) + ' response!');
		});
	}

	function subscribeToStream(streamName, resolveLinkTos, callback, credentials) {
		var subscribeRequest = new Messages.SubscribeToStream(streamName, resolveLinkTos);
		var data = subscribeRequest.encode().toBuffer();

		var correlationId = sendMessage(COMMANDS.SubscribeToStream, credentials, data, function(pkg) {
			switch (pkg.command) {
				case COMMANDS.SubscriptionConfirmation:
					var confirmation = Messages.SubscriptionConfirmation.decode(pkg.data);
					console.log("Subscription confirmed (last commit " + confirmation.last_commit_position + ", last event " + confirmation.last_event_number + ")");
					break;

				case COMMANDS.SubscriptionDropped:
					var dropped = Messages.SubscriptionDropped.decode(pkg.data);
					var reason = dropped.reason;
					switch (dropped.reason) {
						case 0:
							reason = "unsubscribed";
							break;
						case 1:
							reason = "access denied";
							break;
					}
					console.log("Subscription dropped (" + reason + ")");
					break;

				case COMMANDS.StreamEventAppeared:
					var eventAppeared = Messages.StreamEventAppeared.decode(pkg.data);

					// StreamEventAppeared.ResolvedEvent.EventRecord
					var eventRecord = eventAppeared.event.event;
					var event = {
						stream_id: eventRecord.event_stream_id,
						number: eventRecord.event_number,
						id: eventRecord.event_id.toString('hex'),
						type: eventRecord.event_type,
						created: eventRecord.created
					}

					var data = eventRecord.data.toBuffer();
					if (data[0] == 0x7B) {
						// JSON
						event.data = JSON.parse(data.toString());
					} else {
						// Binary
						event.data = data;
						event.data_hex = data.toString('hex');
					}

					callback(event);
					break;

				default:
					console.log('TODO: Add support for parsing ' + getCommandName(pkg.command) + ' events');
					break;
			}
		});
		return correlationId;
	}

	/*************************************************************************************************/

	function createGuid() {
		var buffer = new Buffer(GUID_LENGTH);
		uuid.v1({}, buffer)
		return buffer;
	}

	/***
	 * Returns a nice name for a TCP Command ID
	 */
	function getCommandName(command) {
		for(var key in COMMANDS) {
			if (COMMANDS.hasOwnProperty(key)) {
				if (COMMANDS[key] == command) {
					return key;
				}
			}
		}
		return command.toString();
	}

	function sendMessage(command, credentials, data, callback) {
		var correlationId = createGuid();
		var key = correlationId.toString('hex');
		if (callback != null) {
			callbacks[key] = callback;
		}

		// Handle authentication
		var authLength = 0;
		var flags = FLAGS_NONE;
		if (credentials) {
			flags = FLAGS_AUTH;
			// FIXME: Add support for multi-byte characters
			authLength = 1 + credentials.username.length + 1 + credentials.password.length;
		}

		var commandLength = HEADER_LENGTH + authLength;
		if (data != null) {
			commandLength += data.length;
		}
		var packetLength = 4 + commandLength;
		var buf = new Buffer(packetLength);
		//console.log("Command " + command + ", Flags " + flags +", CorrelationId " + correlationId.toString('hex') + ", Packet length " + packetLength)

		// Command length (4 bytes)
		buf.writeUInt32LE(commandLength, 0);

		// TCP Command (1 byte) + TCP Flags (1 byte)
		buf[COMMAND_OFFSET] = command;
		buf[FLAGS_OFFSET] = flags;

		// Correlation ID (16 byte GUID)
		correlationId.copy(buf, CORRELATION_ID_OFFSET, 0, GUID_LENGTH);

		// User's credentials
		if (credentials) {
			buf.writeUInt8(credentials.username.length, DATA_OFFSET);
			buf.write(credentials.username, DATA_OFFSET + 1);
			buf.writeUInt8(credentials.password.length, DATA_OFFSET + 1 + credentials.username.length);
			buf.write(credentials.password, DATA_OFFSET + 1 + credentials.username.length + 1);
		}

		if (data != null) {
			data.copy(buf, DATA_OFFSET + authLength, 0, data.length);
		}

		if (debug) {
			console.log('Outbound: ' + buf.toString('hex') + ' (' + buf.length + ' bytes) ' + getCommandName(command));
		}
		connection.write(buf);
		return key;
	}

	function receiveMessage(buf) {
		var command = buf[COMMAND_OFFSET];
		if (debug) {
			console.log('Inbound:  ' + buf.toString('hex') + ' (' + buf.length + ' bytes) ' + getCommandName(command));
		}

		// Read the packet length
		var commandLength = buf.readUInt32LE(0);
		if (commandLength < HEADER_LENGTH) {
			console.error('Invalid command length of ' + commandLength + ' bytes. Needs to be at least big enough for the header')
			connection.close();
		}

		// Read the header
		//var command = buf[COMMAND_OFFSET];
		var flags = buf[FLAGS_OFFSET];
		var correlationId = buf.toString('hex', CORRELATION_ID_OFFSET, CORRELATION_ID_OFFSET + GUID_LENGTH);
		
		// Read the payload data
		var dataLength = commandLength - HEADER_LENGTH;
		var data = new Buffer(dataLength);
		if (dataLength > 0) {
			buf.copy(data, 0, DATA_OFFSET, DATA_OFFSET + dataLength);
		}

		// Handle the message
		if (command == COMMANDS.HeartbeatRequest) {
			// Automatically respond to heartbeat requests
			sendMessage(COMMANDS.HeartbeatResponse);

		} else if (callbacks.hasOwnProperty(correlationId)) {
			// Handle the callback that was previously registered when the request was sent
			var callback = callbacks[correlationId];
			//delete callbacks[correlationId]; // FIXME: Some requests are single hit (like ping), others are persistent (like subscribe)

			var pkg = {
				command: command,
				flags: flags,
				data: data
			}

			try {
				callback(pkg);
			} catch (x) {
				console.error("Callback for " + correlationId + " failed, unhooking.\r\n" + x);
				delete callbacks[correlationId];
			}
		} else {
			console.warn('Received ' + getCommandName(command) + ' message with unknown correlation ID: ' + correlationId);
		}
	}
});