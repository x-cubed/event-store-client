var assert = require("assert");
var uuid   = require('node-uuid');

var EventStoreClient = require("../index.js");
var dbconn = require("./common/dbconn");
var defaultHostName = dbconn.defaultHostName;
var credentials = dbconn.credentials;


    describe('Reading from the stats stream', function() {
    	var readEvents;
		var streamId;

        var maxCount = 10;
        var resolveLinkTos = false;
        var requireMaster = false;
        var onEventAppeared = function (event) {
            readEvents++;
        };

    	beforeEach(function() {
            readEvents = 0;

            var host = process.env.EVENTSTORE_HOST || "0.0.0.0"
            streamId = "$stats-" + host + ":2113";
    	});

        it("should read 10 events from the stats stream backwards", function(done) {

            var fromEventNumber = -1;
            var connection = new EventStoreClient.Connection({
                host: defaultHostName,
                onError: done
            });

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

            var fromEventNumber = 0;
            var connection = new EventStoreClient.Connection({
                host: defaultHostName,
                onError: done
            });

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