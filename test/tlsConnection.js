process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var assert    =  require("assert");
var uuidParse = require('uuid-parse')

var EventStoreClient = require("../index.js");
var dbconn = require("./common/tls_dbconn");
var defaultHostName = dbconn.defaultHostName;
var credentials = dbconn.credentials;
var port = dbconn.port;

describe('TlsConnection', function() {
    describe('Establishing a tls connection', function() {
        it('should connect successfully to eventstore via tls', function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done
            };
            var connection = new EventStoreClient.TlsConnection(options);
            connection.sendPing(function() {
                connection.close();
                done();
            });
        });

        it('should fail to connect to nosuchhost.example.com', function(done) {
            var options = {
                host: "nosuchhost.example.com",
                port: port,
                onError: function(err) {
                    assert.equal(err.code, "ENOTFOUND", "Expected to get an ENOTFOUND error as the host does not exist");
                    done();
                }
            };
            var connection = new EventStoreClient.TlsConnection(options);
            connection.sendPing(function() {
                assert.fail("Should not have been able to send a ping across a failed connection");
            });
        });

        it('should call close event handler', function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done,
                onClose: function (hadError) {
                    assert.notEqual(hadError, true);
                    done();
                }
            };
            var connection = new EventStoreClient.TlsConnection(options);
            connection.sendPing(function() {
                connection.close();
            });
        });
    });

    describe('Reading from a stream', function() {
        it("should read 10 events from the stats stream backwards", function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done
            };

            var readEvents = 0;

            var streamId = "$stats-0.0.0.0:2113";
            var fromEventNumber = -1;
            var maxCount = 10;
            var resolveLinkTos = false;
            var requireMaster = false;
            var onEventAppeared = function (event) {
                readEvents++;
            };

            var connection = new EventStoreClient.TlsConnection(options);
            connection.readStreamEventsBackward(streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, function (completed) {
                assert.equal(completed.result, EventStoreClient.ReadStreamResult.Success,
                    "Expected a result code of Success, not " + EventStoreClient.ReadStreamResult.getName(completed.result)
                );
                assert.ok(readEvents > 0, "Expected to read at least one event");

                connection.close();
                done();
            });
        });
        it("should read 10 events from the stats stream forwards", function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done
            };

            var readEvents = 0;

            var streamId = "$stats-0.0.0.0:2113";
            var fromEventNumber = 0;
            var maxCount = 10;
            var resolveLinkTos = false;
            var requireMaster = false;
            var onEventAppeared = function (event) {
                readEvents++;
            };

            var connection = new EventStoreClient.TlsConnection(options);
            connection.readStreamEventsForward(streamId, fromEventNumber, maxCount, resolveLinkTos, requireMaster, onEventAppeared, credentials, function (completed) {
                assert.equal(completed.result, EventStoreClient.ReadStreamResult.Success,
                    "Expected a result code of Success, not " + EventStoreClient.ReadStreamResult.getName(completed.result)
                );
                assert.ok(readEvents > 0, "Expected to read at least one event");

                connection.close();
                done();
            });
        });
    });

    describe('Writing to a stream', function() {
        it("should be able to write 1 event with a binary GUID to the end of the stream", function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done
            };

            var streamId = "event-store-client-test";
            var expectedVersion = EventStoreClient.ExpectedVersion.Any;
            var requireMaster = false;
            var events = [{
                eventId: EventStoreClient.TlsConnection.createGuid(),
                eventType: "TestEvent",
                data: {
                    testRanAt: new Date().toISOString()
                }
            }];

            var connection = new EventStoreClient.TlsConnection(options);
            connection.writeEvents(streamId, expectedVersion, requireMaster, events, credentials, function (completed) {
                assert.equal(completed.result, EventStoreClient.OperationResult.Success,
                    "Expected a result code of Success, not " + EventStoreClient.OperationResult.getName(completed.result) + ": " + completed.message
                );

                connection.close();
                done();
            });
        });
        it("should be able to write 1 event with a hex GUID to the end of the stream", function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done
            };

            var streamId = "event-store-client-test";
            var expectedVersion = EventStoreClient.ExpectedVersion.Any;
            var requireMaster = false;
            var events = [{
                eventId: EventStoreClient.TlsConnection.createGuid().toString('hex'),
                eventType: "TestEvent",
                data: {
                    testRanAt: new Date().toISOString()
                }
            }];

            var connection = new EventStoreClient.TlsConnection(options);
            connection.writeEvents(streamId, expectedVersion, requireMaster, events, credentials, function (completed) {
                assert.equal(completed.result, EventStoreClient.OperationResult.Success,
                    "Expected a result code of Success, not " + EventStoreClient.OperationResult.getName(completed.result) + ": " + completed.message
                );

                connection.close();
                done();
            });
        });

        it("should be able to write 1 event with a braced hex GUID to the end of the stream", function(done) {
            var options = {
                host: defaultHostName,
                port: port,
                onError: done
            };

            var streamId = "event-store-client-test";
            var expectedVersion = EventStoreClient.ExpectedVersion.Any;
            var requireMaster = false;
            var events = [{
                eventId: uuidParse.unparse(EventStoreClient.TlsConnection.createGuid()),
                eventType: "TestEvent",
                data: {
                    testRanAt: new Date().toISOString()
                }
            }];

            var connection = new EventStoreClient.TlsConnection(options);
            connection.writeEvents(streamId, expectedVersion, requireMaster, events, credentials, function (completed) {
                assert.equal(completed.result, EventStoreClient.OperationResult.Success,
                    "Expected a result code of Success, not " + EventStoreClient.OperationResult.getName(completed.result) + ": " + completed.message
                );

                connection.close();
                done();
            });
        });
    });
});
