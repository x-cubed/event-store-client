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

console.log('Reading events forward from ' + streamId + '...');
var readId = connection.readStreamEventsForward(streamId, 0, 100, true, false, onEventAppeared, credentials, function(completed) {
    console.log('Received a completed event: ' + completed.result + ' (error: ' + completed.error + ')');
});


console.log('Subscribing to ' + streamId + "...");
var correlationId = connection.subscribeToStream(streamId, true, onEventAppeared, onSubscriptionConfirmed, onSubscriptionDropped, credentials);

function onEventAppeared(streamEvent) {
    if (streamEvent.stream_id != streamId) {
        console.log("Unknown event from " + streamEvent.stream_id);
        return;
    }
    var cpuPercent = Math.ceil(100 * streamEvent.data["proc-cpu"]);
    var receivedBytes = streamEvent.data["proc-tcp-receivedBytesTotal"];
    var sentBytes = streamEvent.data["proc-tcp-sentBytesTotal"];
    console.log("ES CPU " + cpuPercent + "%, TCP Bytes Received " + receivedBytes + ", TCP Bytes Sent " + sentBytes);
    connection.unsubscribeFromStream(correlationId, credentials, function() {
        console.log("Unsubscribed");
        connection.close();
    });
}

function onSubscriptionConfirmed(confirmation) {
    console.log("Subscription confirmed (last commit " + confirmation.last_commit_position + ", last event " + confirmation.last_event_number + ")");
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