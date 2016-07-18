var net                 = require("net");
var uuid                = require('node-uuid');

var CatchUpSubscription = require("./catchUpSubscription");
var Messages            = require("./messages");
var Commands            = require("./commands");
var OperationResult     = require("./operationResult");
var ReadAllResult       = require("./readAllResult");
var ReadStreamResult    = require("./readStreamResult");

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

    // Set default option values
    options.host = options.host || "localhost";
    options.port = options.port || 1113;
    if (options.debug) {
        instance.debug = true;
    }

    // Connect to the server
    this.connection = net.connect(options, function () {
        // Connected
        if (options.onConnect) {
            options.onConnect();
        }
    });

    instance.connection.on('error', options.onError || defaultOnError);
    instance.connection.on('close', options.onClose || defaultOnClose);
    instance.connection.on('data', onData);

    /***
     * Called whenever the socket receives data from the EventStore.
     * Splits the incoming data into messages, and passes each message to receiveMessage
     * @param data A Buffer containing the data received from Event Store
     */
    function onData(data) {
        var packetLength = 0;
        while (data != null) {
            if (instance.currentMessage == null) {
                // This is the start of a new message
                var commandLength = data.readUInt32LE(0);
                if (commandLength < HEADER_LENGTH) {
                    console.error('Invalid command length of ' + commandLength + ' bytes. Needs to be at least big enough for the header');
                    instance.connection.close();
                    return;
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
                    instance.currentLength = messageLength;
                    receiveMessage(firstMessage);
                    data = data.slice(instance.currentLength);
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

    /***
     * Called when a socket error occurs
     * @param err The error that occurred
     */
    function defaultOnError(err) {
        console.error(err);
        instance.connection.end();
    }

    /***
     * Called when the socket is closed (does nothing)
     * @param hadError true if the socket had a transmission error
     */
    function defaultOnClose(hadError) {
        
    }

    /***
     * Called when a complete message has arrived from the EventStore.
     * @param buf A Buffer containing a complete message
     */
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
            return;
        }

        // Read the header
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
            switch (command) {
                case Commands.SubscriptionConfirmation:
                case Commands.StreamEventAppeared:
                    // This is a subscription event, we'll see more in future for the same correlation ID
                    break;

                default:
                    // This is the last message we expect to see for this correlation ID
                    delete instance.callbacks[correlationId];
                    break;
            }

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

/***
 * Closes the connection to the Event Store
 */
Connection.prototype.close = function() {
    this.connection.end();
};

/***
 * Creates a Buffer containing a new v4 GUID
 * @returns {Buffer}
 */
Connection.createGuid = function() {
    var buffer = new Buffer(GUID_LENGTH);
    uuid.v4({}, buffer);
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
 * @returns {Buffer} The correlation GUID for this subscription
 */
Connection.prototype.subscribeToStream = function(streamName, resolveLinkTos, onEventAppeared, onConfirmed, onDropped, credentials) {
    var subscribeRequest = new Messages.SubscribeToStream(streamName, resolveLinkTos);
    var data = subscribeRequest.encode().toBuffer();

    var correlationId = Connection.createGuid();
    this.sendMessage(correlationId, Commands.SubscribeToStream, credentials, data, function(pkg) {
        switch (pkg.command) {
            case Commands.SubscriptionConfirmation:
                if (onConfirmed) {
                    var confirmation = Messages.SubscriptionConfirmation.decode(pkg.data);
                    onConfirmed(confirmation);
                }
                break;

            case Commands.SubscriptionDropped:
                if (onDropped) {
                    var dropped = Messages.SubscriptionDropped.decode(pkg.data);
                    onDropped(dropped);
                }
                break;

            case Commands.StreamEventAppeared:
                var eventAppeared = Messages.StreamEventAppeared.decode(pkg.data);
                var event = unpackResolvedEvent(eventAppeared.event);
                onEventAppeared(event);
                break;

            case Commands.NotAuthenticated:
                // This occurs when the username or password is incorrect
                // We'll just treat it the same as the subscription being dropped
                if (onDropped) {
                    var dropped = new Messages.SubscriptionDropped();
                    dropped.reason = 1; // Access Denied
                    onDropped(dropped);
                }
                break;

            default:
                console.warn('TODO: Add support for parsing ' + Commands.getCommandName(pkg.command) + ' events');
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

/**
     * Initiate catch-up subscription for one stream.
     * 
     * @param {string} streamId The stream ID (only if subscribing to a single stream)
     * @param {number} fromEventNumber Which event number to start after (if null, then from the beginning of the stream.)
     * @param {ICredentials} credentials User credentials for the operations.
     * @param {function} onEventAppeared Callback for each event received
     * @param {function} onLiveProcessingStarted Callback when read history phase finishes.
     * @param {function} onDropped Callback when subscription drops or is dropped.
     * @param {CatchUpSubscriptionSettings} settings Settings for this subscription.
     */
Connection.prototype.subscribeToStreamFrom = function (streamId, fromEventNumber, credentials, onEventAppeared, onLiveProcessingStarted, onDropped, settings) {
    if (!settings) settings = new CatchUpSubscription.Settings();
    var subscription = new CatchUpSubscription.Stream(this, streamId, fromEventNumber, credentials, onEventAppeared, onLiveProcessingStarted, onDropped, settings);
    subscription.start();
    return subscription;
};

Connection.prototype.deleteStream = function(streamId, expectedVersion, requireMaster, hardDelete, credentials, callback) {
    var deleteRequest = new Messages.DeleteStream();
    deleteRequest.eventStreamId = streamId;
    deleteRequest.expectedVersion = expectedVersion;
    deleteRequest.requireMaster = requireMaster;
    deleteRequest.hardDelete = hardDelete;
    var data = deleteRequest.encode().toBuffer();

    function onFailure(result, errorText) {
        var message = new Messages.DeleteStreamCompleted();
        message.result = result;
        message.message = errorText;
        callback(message);
    }

    function onError(errorText) {
        onFailure(OperationResult.Error, errorText);
    }

    var correlationId = Connection.createGuid();
    this.sendMessage(correlationId, Commands.DeleteStream, credentials, data, function(response) {
        var message;
        switch (response.command) {
            case Commands.DeleteStreamCompleted:
                message = Messages.DeleteStreamCompleted.decode(response.data);
                callback(message);
                break;

            case Commands.NotAuthenticated:
                onFailure(OperationResult.AccessDenied, "Not authenticated");
                break;

            case Commands.NotHandled:
                message = Messages.NotHandled.decode(response.data);
                onError("Not handled: " + message.reason);
                break;

            case Commands.BadRequest:
                message = response.data;
                onError("Bad request: " + message);
                break;

            default:
                onError("Unexpected response: " + Commands.getCommandName(response.command));
                break;
        }
    });
};

Connection.prototype.readAllEventsBackward = function(commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readAllEvents(this, Commands.ReadAllEventsBackward, commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
};

Connection.prototype.readAllEventsForward = function(commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readAllEvents(this, Commands.ReadAllEventsForward, commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
};

Connection.prototype.readStreamEventsBackward = function(streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readStreamEvents(this, Commands.ReadStreamEventsBackward, streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
};

Connection.prototype.readStreamEventsForward = function(streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    return readStreamEvents(this, Commands.ReadStreamEventsForward, streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback);
};

Connection.prototype.writeEvents = function(streamId, expectedVersion, requireMaster, events, credentials, callback) {
    // Convert the data into the format required for the message
    for(var i=0; i<events.length; i++) {
        var event = events[i];
        if (!event) {
            throw new Error("Event " + i + " is undefined or null");
        }

        // Ensure that the event has an eventId GUID in the right format
        if (event.eventId) {
            if (typeof event.eventId == "string") {
                // GUID has been supplied as a hex string, convert it to a buffer
                var hex = event.eventId.replace(/[^0-9a-fA-F]/g, "");
                if (hex.length != 32) {
                    throw new Error("Event " + i + " does not have a valid GUID for eventId: " + hex);
                }
                event.eventId = new Buffer(hex, "hex");
            } else if (!Buffer.isBuffer(event.eventId)) {
                // GUID is not a string or a Buffer
                throw new Error("Event " + i + " does not have a valid eventId. Expected a string or a Buffer.");
            }
        } else {
            throw new Error("Event " + i + " has no eventId specified");
        }

        // Update the metadata for the event based on the supplied data
        if (event.data) {
            if (Buffer.isBuffer(event.data)) {
                // Binary data
                event.dataContentType = 0;
            } else {
                // JSON encode the nested objects
                event.dataContentType = 1;
                var json = JSON.stringify(event.data);
                event.data = new Buffer(json);
            }
        } else {
            event.dataContentType = 0;
            event.data = [];
        }

        if (event.metadata) {            
            if (Buffer.isBuffer(event.metadata)) {
                // Binary metadata
                event.metadataContentType = 0;
            } else {
                // JSON encode the nested objects
                event.metadataContentType = 1;
                var json = JSON.stringify(event.metadata);
                event.metadata = new Buffer(json);
            }
        } else {
            event.metadataContentType = 0;
            event.metadata = null;
        }
    }

    var writeEvents = new Messages.WriteEvents();
    writeEvents.eventStreamId = streamId;
    writeEvents.expectedVersion = expectedVersion;
    writeEvents.events = events;
    writeEvents.requireMaster = requireMaster;
    var data = writeEvents.encode().toBuffer();

    function onFailure(result, errorText) {
        var message = new Messages.WriteEventsCompleted();
        message.result = result;
        message.message = errorText;
        message.firstEventNumber = 0;
        message.lastEventNumber = 0;
        message.preparePosition = 0;
        message.commitPosition = 0;
        callback(message);
    }

    function onError(errorText) {
        onFailure(OperationResult.Error, errorText);
    }

    var correlationId = Connection.createGuid();
    this.sendMessage(correlationId, Commands.WriteEvents, credentials, data, function(response) {
        var message;
        switch (response.command) {
            case Commands.WriteEventsCompleted:
                message = Messages.WriteEventsCompleted.decode(response.data);
                callback(message);
                break;

            case Commands.NotAuthenticated:
                onFailure(OperationResult.AccessDenied, "Not authenticated");
                break;

            case Commands.NotHandled:
                message = Messages.NotHandled.decode(response.data);
                onError("Not handled: " + message.reason);
                break;

            case Commands.BadRequest:
                message = response.data;
                onError("Bad request: " + message);
                break;

            default:
                onError("Unexpected response: " + Commands.getCommandName(response.command));
                break;
        }
    });
    return correlationId;
};

Connection.prototype.sendMessage = function(correlationId, command, credentials, data, callback) {
    if (typeof correlationId == "string") {
        correlationId = new Buffer(correlationId);
    }

    var key = correlationId.toString('hex');
    if (callback) {
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
    if (data) {
        commandLength += data.length;
    }
    var packetLength = 4 + commandLength;
    var buf = new Buffer(packetLength);

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

    if (data) {
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

    var unpackedEvent = {};
    if (resolvedEvent.event) {
        unpackedEvent = unpackEventRecord(resolvedEvent.event);
    }

    if (resolvedEvent.link) unpackedEvent.link = unpackEventRecord(resolvedEvent.link);
    return unpackedEvent;
}

function uuidStringFromBuffer(buffer) {
    var hex = buffer.toString('hex');
    var guid = hex.substring(6, 8) + hex.substring(4, 6) + hex.substring(2, 4) + hex.substring(0, 2) + "-" +
        hex.substring(10, 12) + hex.substring(8, 10) + "-" +
        hex.substring(14, 16) + hex.substring(12, 14) + "-" +
        hex.substring(16, 20) + "-" +
        hex.substring(20);
    return guid;
}

function unpackEventRecord(eventRecord) {
    if (!eventRecord) {
        return null;
    }

    if (!eventRecord.eventId) {
        throw new Error("Not an EventRecord: " + eventRecord);
    }

    var eventId = uuidStringFromBuffer(eventRecord.eventId);
    var event = {
        streamId: eventRecord.eventStreamId,
        eventNumber: eventRecord.eventNumber,
        eventId: eventId,
        eventType: eventRecord.eventType,
        isJson: false,
        created: new Date(parseInt(eventRecord.createdEpoch))
    };

    var data = eventRecord.data.toBuffer();
    if (!data) {
        event.data = null;
    } else if (eventRecord.dataContentType === 1) {
        // alternatively check for open curly brace (data[0] == 0x7B)
        // JSON
        event.data = JSON.parse(data.toString());
        event.isJson = true;
    } else {
        // Binary
        event.data = data;
        event.dataHex = data.toString('hex');
    }

    event.metadata = parseMetadata(eventRecord);

    return event;
}

function parseMetadata(eventRecord) {
    var metadata = eventRecord.metadata.toBuffer();
    if (metadata.length === 0) {
        return null;
    } 

    // Metadata may be JSON or binary - EventStore does not honour the metadata_content_type field,
    // and will set it to the same value as the data_content_type field.
    try {
        var json = JSON.parse(metadata.toString());
        return json
    } catch (err) {
        return metadata
    }        
}

/***
 * Loops through the ResolvedEvents in the provided array, unpacks each one from JSON data into a JS object,
 * then invokes the onEventAppeared callback for each event
 * @param events An array of ResolvedEvent messages
 * @param onEventAppeared A callback that takes an Event object
 */
function unpackAndNotifyResolvedEvents(events, onEventAppeared) {
    if (!events) {
        return [];
    }
    var unpackedEvents = [];
    for(var i=0; i<events.length; i++) {
        var event = unpackResolvedEvent(events[i]);
        unpackedEvents.push(event);
        if (onEventAppeared) {
            onEventAppeared(event);
        }
    }
    return unpackedEvents;
}

function readAllEvents(connection, command, commitPosition, preparePosition, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    var readAllEvents = new Messages.ReadAllEvents();
    readAllEvents.commitPosition = commitPosition;
    readAllEvents.preparePosition = preparePosition;
    readAllEvents.maxCount = maxCount;
    readAllEvents.resolveLinkTos = resolveLinkTos;
    readAllEvents.requireMaster = requireMaster;
    var data = readAllEvents.encode().toBuffer();

    function onFailure(result, errorText) {
        var readAllCompleted = new Messages.ReadAllEventsCompleted();
        readAllCompleted.commitPosition = 0;
        readAllCompleted.preparePosition = 0;
        readAllCompleted.events = [];
        readAllCompleted.nextCommitPosition = 0;
        readAllCompleted.nextPreparePosition = 0;
        readAllCompleted.result = result;
        readAllCompleted.error = errorText;
        callback(readAllCompleted);
    }

    function onError(errorText) {
        onFailure(ReadAllResult.Error, errorText);
    }

    function onNotAuthenticated() {
        onFailure(ReadAllResult.AccessDenied, "Not authenticated");
    }

    var correlationId = Connection.createGuid();
    connection.sendMessage(correlationId, command, credentials, data, function(response) {
        handleReadResponse(response, callback, onEventAppeared, onNotAuthenticated, onError);
    });
    return correlationId;
}

function handleReadResponse(response, onSuccess, onEventAppeared, onNotAuthenticated, onError) {
    var message;
    switch (response.command) {
        case Commands.ReadAllEventsBackwardCompleted:
        case Commands.ReadAllEventsForwardCompleted:
            message = Messages.ReadAllEventsCompleted.decode(response.data);
            message.events = unpackAndNotifyResolvedEvents(message.events, onEventAppeared);
            onSuccess(message);
            break;

        case Commands.ReadStreamEventsBackwardCompleted:
        case Commands.ReadStreamEventsForwardCompleted:
            message = Messages.ReadStreamEventsCompleted.decode(response.data);
            message.events = unpackAndNotifyResolvedEvents(message.events, onEventAppeared);
            onSuccess(message);
            break;

        case Commands.NotAuthenticated:
            onNotAuthenticated();
            break;

        case Commands.NotHandled:
            message = Messages.NotHandled.decode(response.data);
            onError("Not handled: " + message.reason);
            break;

        case Commands.BadRequest:
            message = response.data;
            onError("Bad request: " + message);
            break;

        default:
            onError("Unexpected response: " + Commands.getCommandName(response.command));
            break;
    }
}

function readStreamEvents(connection, command, streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, callback) {
    var readStreamEvents = new Messages.ReadStreamEvents();
    readStreamEvents.eventStreamId = streamId;
    readStreamEvents.fromEventNumber = fromEventNumber;
    readStreamEvents.maxCount = maxCount;
    readStreamEvents.resolveLinkTos = resolveLinkTos;
    readStreamEvents.requireMaster = requireMaster;
    var data = readStreamEvents.encode().toBuffer();

    function onFailure(result, errorText) {
        var readStreamCompleted = new Messages.ReadStreamEventsCompleted();
        readStreamCompleted.events = [];
        readStreamCompleted.result = result;
        readStreamCompleted.nextEventNumber = 0;
        readStreamCompleted.lastEventNumber = 0;
        readStreamCompleted.isEndOfStream = true;
        readStreamCompleted.lastCommitPosition = 0;
        readStreamCompleted.error = errorText;
        callback(readStreamCompleted);
    }

    function onError(errorText) {
        onFailure(ReadStreamResult.Error, errorText);
    }

    function onNotAuthenticated() {
        onFailure(ReadStreamResult.AccessDenied, "Not authenticated");
    }

    var correlationId = Connection.createGuid();
    connection.sendMessage(correlationId, command, credentials, data, function(response) {
        handleReadResponse(response, callback, onEventAppeared, onNotAuthenticated, onError);
    });
    return correlationId;
}

module.exports = Connection;