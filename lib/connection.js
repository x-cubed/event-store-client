var net = require("net");
var uuid = require('node-uuid');

var Messages = require("./messages");
var Commands = require("./commands");

/*************************************************************************************************/
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

/***
 * Creates a new native TCP connection to an EventStore instance
 * @param options The host and port to connect to
 * @constructor
 */
function Connection(options) {
    var instance = this;

    this.debug = false;
    this.callbacks = {};
    this.currentOffset = 0;
    this.currentLength = 0;
    this.currentMessage = null;
    this.connection = net.connect(options, function () {
        if (options.debug) {
            instance.debug = true;
        }

        instance.connection.on('error', onError);
        instance.connection.on('data', onData);
    });

    function onData(data) {
        var packetLength = 0;
        while (data != null) {
            if (instance.currentMessage == null) {
                // Read the command length
                var commandLength = data.readUInt32LE(0);
                if (commandLength < HEADER_LENGTH) {
                    console.error('Invalid command length of ' + commandLength + ' bytes. Needs to be at least big enough for the header');
                    instance.connection.close();
                }

                // The entire message will include the command length at the start
                var messageLength = UINT32_LENGTH + commandLength;
                if (data.length == messageLength) {
                    // A single packet message, no need to copy into another buffer
                    receiveMessage(data);
                    data = null;
                } else if (data.length > messageLength) {
                    // Multiple messages in one packet
                    var firstMessage = data.slice(0, messageLength);
                    receiveMessage(firstMessage);
                    data = data.slice(instance.currentLength, data.length - instance.currentLength);
                } else {
                    // The first packet of a multi-packet message
                    instance.currentMessage = new Buffer(messageLength);
                    packetLength = data.copy(instance.currentMessage, instance.currentOffset, 0);
                    instance.currentOffset = packetLength;
                    data = null;
                }
            } else {
                // Another packet for a multi-packet message
                packetLength = data.copy(instance.currentMessage, instance.currentOffset, 0);
                instance.currentOffset += packetLength;
                if (instance.currentOffset >= instance.currentMessage.length) {
                    // Finished receiving the current message
                    receiveMessage(instance.currentMessage);
                    instance.currentMessage = null;
                    instance.currentOffset = 0;
                }
                data = null;
            }
        }
    }

    function onError(err) {
        console.error(err);
        instance.connection.end();
    }

    function receiveMessage(buf) {
        var command = buf[COMMAND_OFFSET];
        if (instance.debug) {
            console.log('Inbound:  ' + buf.toString('hex') + ' (' + buf.length + ' bytes) ' + Commands.getCommandName(command));
        }

        // Read the packet length
        var commandLength = buf.readUInt32LE(0);
        if (commandLength < HEADER_LENGTH) {
            console.error('Invalid command length of ' + commandLength + ' bytes. Needs to be at least big enough for the header');
            instance.connection.close();
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
        if (command == Commands.HeartbeatRequest) {
            // Automatically respond to heartbeat requests
            instance.sendMessage(correlationId, Commands.HeartbeatResponse);

        } else if (instance.callbacks.hasOwnProperty(correlationId)) {
            // Handle the callback that was previously registered when the request was sent
            var callback = instance.callbacks[correlationId];
            //delete callbacks[correlationId]; // FIXME: Some requests are single hit (like ping), others are persistent (like subscribe)

            var pkg = {
                command: command,
                flags: flags,
                data: data
            };

            try {
                callback(pkg);
            } catch (x) {
                console.error("Callback for " + correlationId + " failed, unhooking.\r\n" + x);
                delete instance.callbacks[correlationId];
            }
        } else {
            console.warn('Received ' + Commands.getCommandName(command) + ' message with unknown correlation ID: ' + correlationId);
        }
    }
}

Connection.prototype.close = function() {
    this.connection.end();
};

Connection.createGuid = function() {
    var buffer = new Buffer(GUID_LENGTH);
    uuid.v1({}, buffer);
    return buffer;
};

/***
 * Sends a ping to the server and expects a pong response
 * @param callback Invoked when the corresponding pong is received from the server
 */
Connection.prototype.sendPing = function(callback) {
    var correlationId = Connection.createGuid();
    this.sendMessage(correlationId, Commands.Ping, null, null, callback);
};

/***
 * Subscribes to a particular stream
 * @param streamName The name of the stream to subscribe to
 * @param resolveLinkTos True, if linked events should be resolved
 * @param onEventAppeared Invoked whenever an event is received via this subscription
 * @param onConfirmed Invoked when the subscription is confirmed (can be null)
 * @param onDropped Invoked when the subscription is dropped (such as when unsubscribing or when permission is denied, can be null)
 * @param credentials Credentials to use to access a protected stream (can be null for public streams)
 * @returns The correlation GUID for this subscription
 */
Connection.prototype.subscribeToStream = function(streamName, resolveLinkTos, onEventAppeared, onConfirmed, onDropped, credentials) {
    var subscribeRequest = new Messages.SubscribeToStream(streamName, resolveLinkTos);
    var data = subscribeRequest.encode().toBuffer();

    var correlationId = Connection.createGuid();
    this.sendMessage(correlationId, Commands.SubscribeToStream, credentials, data, function(pkg) {
        switch (pkg.command) {
            case Commands.SubscriptionConfirmation:
                var confirmation = Messages.SubscriptionConfirmation.decode(pkg.data);
                if (onConfirmed) {
                    onConfirmed(confirmation);
                }
                break;

            case Commands.SubscriptionDropped:
                var dropped = Messages.SubscriptionDropped.decode(pkg.data);
                if (onDropped) {
                    onDropped(dropped);
                }
                break;

            case Commands.StreamEventAppeared:
                var eventAppeared = Messages.StreamEventAppeared.decode(pkg.data);
                var event = unpackResolvedEvent(eventAppeared.event);
                onEventAppeared(event);
                break;

            default:
                console.log('TODO: Add support for parsing ' + Commands.getCommandName(pkg.command) + ' events');
                break;
        }
    });
    return correlationId;
};

Connection.prototype.unsubscribeFromStream = function(correlationId, credentials, callback) {
  var unsubscribeRequest = new Messages.UnsubscribeFromStream();
  var data = unsubscribeRequest.encode().toBuffer();
  this.sendMessage(correlationId, Commands.UnsubscribeFromStream, credentials, data, callback);
};

Connection.prototype.readAllEventsBackward = function(commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readAllEvents(this, Commands.ReadAllEventsBackward, commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
};

Connection.prototype.readAllEventsForward = function(commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readAllEvents(this, Commands.ReadAllEventsForward, commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
};

Connection.prototype.readStreamEventsBackward = function(streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readStreamEvents(this, Commands.ReadStreamEventsBackward, streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
}

Connection.prototype.readStreamEventsForward = function(streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readStreamEvents(this, Commands.ReadStreamEventsForward, streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
}

Connection.prototype.sendMessage = function(correlationId, command, credentials, data, callback) {
    if (typeof correlationId == "string") {
        correlationId = new Buffer(correlationId);
    }

    var key = correlationId.toString('hex');
    if (callback != null) {
        this.callbacks[key] = callback;
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

    if (this.debug) {
        console.log('Outbound: ' + buf.toString('hex') + ' (' + buf.length + ' bytes) ' + Commands.getCommandName(command));
    }
    this.connection.write(buf);
    return key;
};

function unpackResolvedEvent(resolvedEvent) {
    if (!resolvedEvent) {
        return null;
    }
    if (!resolvedEvent.event) {
        throw new Error("Not a ResolvedEvent: " + resolvedEvent);
    }
    return unpackEventRecord(resolvedEvent.event);
}

function unpackEventRecord(eventRecord) {
    if (!eventRecord) {
        return null;
    }

    if (!eventRecord.event_id) {
        throw new Error("Not an EventRecord: " + eventRecord);
    }

    var event = {
        stream_id: eventRecord.event_stream_id,
        number: eventRecord.event_number,
        id: eventRecord.event_id.toString('hex'),
        type: eventRecord.event_type,
        created: eventRecord.created
    };

    var data = eventRecord.data.toBuffer();
    if (!data) {
        event.data = null;
    } else if (data[0] == 0x7B) {
        // JSON
        event.data = JSON.parse(data.toString());
    } else {
        // Binary
        event.data = data;
        event.data_hex = data.toString('hex');
    }
    return event;
}

function readAllEvents(connection, command, commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    var readAllEvents = new Messages.ReadAllEvents();
    readAllEvents.commit_position = commitPosition;
    readAllEvents.prepare_position = preparePosition;
    readAllEvents.max_count = maxCount;
    readAllEvents.resolve_link_tos = resolveLinkTos;
    readAllEvents.require_master = requireMaster;
    var data = readAllEvents.encode().toBuffer();

    var correlationId = Connection.createGuid();
    connection.sendMessage(correlationId, command, credentials, data, function(pkg) {
        switch (pkg.command) {
            case Commands.ReadAllEventsBackwardCompleted:
            case Commands.ReadAllEventsForwardCompleted:
                var readAllCompleted = Messages.ReadAllEventsCompleted.decode(pkg.data);
                callback(readAllCompleted);

                for(var i=0; i<readAllCompleted.events.length; i++) {
                    var event = unpackResolvedEvent(readAllCompleted.events[i]);
                    onEventAppeared(event);
                }
        }
    });
    return correlationId;
}

function readStreamEvents(connection, command, streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    var readStreamEvents = new Messages.ReadStreamEvents();
    readStreamEvents.event_stream_id = streamId;
    readStreamEvents.from_event_number = fromEventNumber;
    readStreamEvents.max_count = maxCount;
    readStreamEvents.resolve_link_tos = resolveLinkTos;
    readStreamEvents.require_master = requireMaster;
    var data = readStreamEvents.encode().toBuffer();

    var correlationId = Connection.createGuid();
    connection.sendMessage(correlationId, command, credentials, data, function(pkg) {
        switch (pkg.command) {
            case Commands.ReadStreamEventsBackwardCompleted:
            case Commands.ReadStreamEventsForwardCompleted:
                var readStreamCompleted = Messages.ReadStreamEventsCompleted.decode(pkg.data);
                callback(readStreamCompleted);

                for(var i=0; i<readStreamCompleted.events.length; i++) {
                    var event = unpackResolvedEvent(readStreamCompleted.events[i]);
                    onEventAppeared(event);
                }
        }
    });
    return correlationId;
}

module.exports = Connection;