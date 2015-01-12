var Connection          = require("./lib/connection");
var Commands            = require("./lib/commands");
var ExpectedVersion     = require("./lib/expectedVersion");
var Messages            = require("./lib/messages");
var OperationResult     = require("./lib/operationResult");

var EventStoreClient = {};
EventStoreClient.Connection         = Connection;
EventStoreClient.Commands           = Commands;
EventStoreClient.ExpectedVersion    = ExpectedVersion;
EventStoreClient.Messages           = Messages;
EventStoreClient.OperationResult    = OperationResult;

module.exports = EventStoreClient;