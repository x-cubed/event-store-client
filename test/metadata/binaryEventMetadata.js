var assert = require("assert");
var EventStoreClient = require("../../index.js");
var dbconn = require("../common/dbconn");

var defaultHostName = dbconn.defaultHostName;
var credentials = dbconn.credentials;

var streamId = "event-store-client-test";

describe("Binary Event Metadata", function() {
    describe("Reading binary metadata from an event", function() {

        var testEventNumber = null;
        var testRunDate = new Date().toISOString();
        
        before("Write a test event with binary metadata", function(done) {
            var events = [{
                eventId: EventStoreClient.Connection.createGuid(),
                eventType: "MetadataTestEvent",
                data: new Buffer("Testing reading and writing event metadata"),
                metadata: new Buffer(testRunDate)
            }];

            var connection = new EventStoreClient.Connection({ host: defaultHostName, onError: done });
            connection.writeEvents(streamId, EventStoreClient.ExpectedVersion.Any, false, events, credentials, function(completed) {
                testEventNumber = completed.firstEventNumber;
                connection.close();
                done();
            });            
        });

        it("should have binary metadata on the event", function(done) {
            var testEvent = null;
            var readSingleEvent = 1;    

            var connection = new EventStoreClient.Connection({ host: defaultHostName, onError: done });
            connection.readStreamEventsBackward(streamId, testEventNumber, readSingleEvent, false, false, onEventAppeared, credentials, onCompleted);

            function onEventAppeared(event) { testEvent = event; }

            function onCompleted(completed) {
                assert.equal(completed.result, EventStoreClient.ReadStreamResult.Success,
                    "Expected a result code of Success, not " + EventStoreClient.ReadStreamResult.getName(completed.result));

                assert.ok(testEvent.isJson === false, 
                    "Expected event to have JSON data");

                assert.equal(testRunDate, testEvent.metadata.toString(),
                    "Expected metadata field 'testRanAt' to match date " + testRunDate);

                connection.close();
                done();
            }
        });
    });
});