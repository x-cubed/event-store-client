var EventStoreClient = require("./index");

// Sample application to demonstrate how to use the Event Store Client
/*************************************************************************************************/
// CONFIGURATION
var config = {
    'eventStore': {
    	'address': "127.0.0.1",
        'port': 1113,
        'stream': '$stats-127.0.0.1:2113',
        'credentials': {
			'username': "admin",
			'password': "changeit"
        }
    },
    'debug': false
};
/*************************************************************************************************/

// Connect to the Event Store
var options = {
	host: config.eventStore.address,
	port: config.eventStore.port,
    debug: config.debug
};
console.log('Connecting to ' + options.host + ':' + options.port + '...');
var connection = new EventStoreClient.Connection(options);
console.log('Connected');

// Ping it to see that its there
connection.sendPing(function(pkg) {
    console.log('Received ' + EventStoreClient.Commands.getCommandName(pkg.command) + ' response!');
});

// Subscribe to receive statistics events
var streamId = config.eventStore.stream;
var credentials = config.eventStore.credentials;

var written = false;
var read = false;
var readMissing = false;

var destinationId = "TestStream";
console.log('Writing events to ' + destinationId + '...');
var newEvent = {
    eventId: EventStoreClient.Connection.createGuid(),
    eventType: 'TestEvent',
    data: {
        textProperty: "value",
        numericProperty: 42
    }
};
var newEvents = [ newEvent ];
connection.writeEvents(destinationId, EventStoreClient.ExpectedVersion.Any, false, newEvents, credentials, function(completed) {
    console.log('Events written result: ' + EventStoreClient.OperationResult.getName(completed.result));
    written = true;
    closeIfDone();
});

var nonExistentStreamId = "NoSuchStream";
console.log('Reading events forward from ' + nonExistentStreamId + '...');
connection.readStreamEventsForward(nonExistentStreamId, 0, 100, true, false, onEventAppeared, credentials, function(completed) {
    console.log('Received a completed event: ' + EventStoreClient.ReadStreamResult.getName(completed.result) + ' (error: ' + completed.error + ')');
    readMissing = true;
    closeIfDone();
});

console.log('Reading events forward from ' + streamId + '...');
connection.readStreamEventsForward(streamId, 0, 100, true, false, onEventAppeared, credentials, function(completed) {
    console.log('Received a completed event: ' + EventStoreClient.ReadStreamResult.getName(completed.result) + ' (error: ' + completed.error + ')');
    read = true;
    closeIfDone();
});


console.log('Subscribing to ' + streamId + "...");
var correlationId = connection.subscribeToStream(streamId, true, function(streamEvent) {
    onEventAppeared(streamEvent);
    connection.unsubscribeFromStream(correlationId, credentials, function() {
        console.log("Unsubscribed");
        closeIfDone();
    });
}, onSubscriptionConfirmed, onSubscriptionDropped, credentials);

function onEventAppeared(streamEvent) {
    if (streamEvent.streamId != streamId) {
        console.log("Unknown event from " + streamEvent.streamId);
        return;
    }
    var cpuPercent = Math.ceil(100 * streamEvent.data["proc-cpu"]);
    var receivedBytes = streamEvent.data["proc-tcp-receivedBytesTotal"];
    var sentBytes = streamEvent.data["proc-tcp-sentBytesTotal"];
    console.log("ES CPU " + cpuPercent + "%, TCP Bytes Received " + receivedBytes + ", TCP Bytes Sent " + sentBytes);
}

function closeIfDone() {
    if (written && read && readMissing) {
        console.log("All done!");
        connection.close();
    }
}

function onSubscriptionConfirmed(confirmation) {
    console.log("Subscription confirmed (last commit " + confirmation.lastCommitPosition + ", last event " + confirmation.lastEventNumber + ")");
}

function onSubscriptionDropped(dropped) {
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
}