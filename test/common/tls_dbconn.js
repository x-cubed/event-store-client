/***
 * To run these tests, install Event Store on a machine, and point the alias eventstore to it, by defining it in your HOSTS file or DNS.
 * You can test against a copy of Event Store on localhost by putting "127.0.0.1 eventstore" in your HOSTS file.
  */

(function(dbconn) {

    var EventStoreClient = require("../../index.js");

    dbconn.defaultHostName = "eventstore";
    dbconn.credentials = {
        username: "admin",
        password: "changeit"
    };
    dbconn.port = 1113;

    dbconn.open = function (onFail, onSuccess, hostName, credentials, port) {
        hostName = hostName || dbconn.defaultHostName;
        credentials = credentials || dbconn.credentials;
        port = port || dbconn.port;

        var connectionError = null;

        var options = {
            host: hostName,
            port: port,
            onError: onFail
        };

        var connection = new EventStoreClient.TlsConnection(options);
        if (connection) onSuccess(connection);
    };

})(module.exports);
