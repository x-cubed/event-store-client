var assert = require("assert");
var EventStoreClient = require("../../index.js");
var dbconn = require("../common/dbconn");

var defaultHostName = dbconn.defaultHostName;
var credentials = dbconn.credentials;

var streamId = "event-store-client-test";

describe("Mixed Event Data and Metadata Types", function() {
	describe("Reading an event with JSON data and binary metadata", function() {

		var testEventNumber = null;
		var testRunDate = new Date().toISOString();

		var data = { comment: "Testing reading and writing event metadata" }
		var metadata = new Buffer(testRunDate)

		before("Write a test event with binary metadata", function(done) {
			var events = [{
				eventId: EventStoreClient.Connection.createGuid(),
				eventType: "MetadataTestEvent",
				data: data,
				metadata: metadata
			}];

			var connection = new EventStoreClient.Connection({ host: defaultHostName, onError: done });
			connection.writeEvents(streamId, EventStoreClient.ExpectedVersion.Any, false, events, credentials, function(completed) {
				testEventNumber = completed.firstEventNumber;
				connection.close();
				done();
			});            
		});

		it("should parse binary and JSON values correctly", function(done) {
			var testEvent = null;
			var readSingleEvent = 1;    

			var connection = new EventStoreClient.Connection({ host: defaultHostName, onError: done });
			connection.readStreamEventsBackward(streamId, testEventNumber, readSingleEvent, false, false, onEventAppeared, credentials, onCompleted);

			function onEventAppeared(event) { testEvent = event; }

			function onCompleted(completed) {
				assert.equal(completed.result, EventStoreClient.ReadStreamResult.Success,
					"Expected a result code of Success, not " + EventStoreClient.ReadStreamResult.getName(completed.result));

				assert.ok(testEvent.isJson === true, 
					"Expected event to have JSON data");

				assert.equal(data.comment, testEvent.data.comment,
					"Expected data field 'comment' to match string " + data.comment)

				assert.equal(testRunDate, testEvent.metadata,
					"Expected metadata field 'testRanAt' to match date " + testRunDate);

				connection.close();
				done();
			}
		});
	});

	describe("Reading an event with binary data and JSON metadata", function() {

		var testEventNumber = null;
		var testRunDate = new Date().toISOString();

		var data = new Buffer("Testing reading and writing event metadata")
		var metadata = { testRanAt: testRunDate }

		before("Write a test event with binary metadata", function(done) {
			var events = [{
				eventId: EventStoreClient.Connection.createGuid(),
				eventType: "MetadataTestEvent",
				data: data,
				metadata: metadata
			}];

			var connection = new EventStoreClient.Connection({ host: defaultHostName, onError: done });
			connection.writeEvents(streamId, EventStoreClient.ExpectedVersion.Any, false, events, credentials, function(completed) {
				testEventNumber = completed.firstEventNumber;
				connection.close();
				done();
			});            
		});

		it("should parse binary and JSON values correctly", function(done) {
			var testEvent = null;
			var readSingleEvent = 1;    

			var connection = new EventStoreClient.Connection({ host: defaultHostName, onError: done });
			connection.readStreamEventsBackward(streamId, testEventNumber, readSingleEvent, false, false, onEventAppeared, credentials, onCompleted);

			function onEventAppeared(event) { testEvent = event; }

			function onCompleted(completed) {
				assert.equal(completed.result, EventStoreClient.ReadStreamResult.Success,
					"Expected a result code of Success, not " + EventStoreClient.ReadStreamResult.getName(completed.result));

				assert.ok(testEvent.isJson === false, 
					"Expected event to have binary data");
				
				assert.equal(data, testEvent.data.toString(),
					"Expected data to match string " + data)

				assert.equal(testRunDate, testEvent.metadata.testRanAt,
					"Expected metadata field 'testRanAt' to match date " + testRunDate);

				connection.close();
				done();
			}
		});
	});
});