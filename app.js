var nconf = require('nconf');
var EventStoreClient = require("./index");

/*************************************************************************************************/
// CONFIGURATION
// First consider commandline arguments and environment variables, respectively.
nconf.argv().env();

// Then load configuration from a designated file.
nconf.file({
	file: 'config.json'
});

// Provide default values for settings not provided above.
nconf.defaults({
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
});

/*************************************************************************************************/

var options = {
	host: nconf.get('eventStore:address'),
	port: nconf.get('eventStore:port'),
    debug: nconf.get('debug')
};
console.log('Connecting to ' + options.host + ':' + options.port + '...');
var connection = new EventStoreClient.Connection(options);
console.log('Connected');

connection.sendPing(function(pkg) {
    console.log('Received ' + EventStoreClient.Commands.getCommandName(pkg.command) + ' response!');
});

var streamId = nconf.get('eventStore:stream');
var credentials = nconf.get('eventStore:credentials');
console.log('Subscribing to ' + streamId + "...");
connection.subscribeToStream(streamId, true, function(streamEvent) {
    var cpuPercent = Math.ceil(100 * streamEvent.data["proc-cpu"]);
    var receivedBytes = streamEvent.data["proc-tcp-receivedBytesTotal"];
    var sentBytes = streamEvent.data["proc-tcp-sentBytesTotal"];
    console.log("ES CPU " + cpuPercent + "%, TCP Bytes Received " + receivedBytes + ", TCP Bytes Sent " + sentBytes);
}, function(confirmation) {
    console.log("Subscription confirmed (last commit " + confirmation.last_commit_position + ", last event " + confirmation.last_event_number + ")");
}, function(dropped) {
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
}, credentials);

