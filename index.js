var CatchUpSubscription = require("./lib/catchUpSubscription"),
    Connection          = require("./lib/connection"),
    TlsConnection       = require("./lib/tlsConnection"),
    Commands            = require("./lib/commands"),
    ExpectedVersion     = require("./lib/expectedVersion"),
    Messages            = require("./lib/messages"),
    OperationResult     = require("./lib/operationResult"),
    ReadAllResult       = require("./lib/readAllResult"),
    ReadStreamResult    = require("./lib/readStreamResult"),
    EventStoreClient    = {};

EventStoreClient.CatchUpSubscription = CatchUpSubscription;
EventStoreClient.Connection          = Connection;
EventStoreClient.TlsConnection       = TlsConnection;
EventStoreClient.Commands            = Commands;
EventStoreClient.ExpectedVersion     = ExpectedVersion;
EventStoreClient.Messages            = Messages;
EventStoreClient.OperationResult     = OperationResult;
EventStoreClient.ReadAllResult       = ReadAllResult;
EventStoreClient.ReadStreamResult    = ReadStreamResult;

module.exports = EventStoreClient;
