var Connection = require("./lib/connection");
var Commands   = require("./lib/commands");
var Messages   = require("./lib/messages");

var EventStoreClient = {};
EventStoreClient.Connection = Connection;
EventStoreClient.Commands   = Commands;
EventStoreClient.Messages   = Messages;

module.exports = EventStoreClient;