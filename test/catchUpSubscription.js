var assert = require("assert");

var EventStoreClient = require("../index.js");

var dbconn = require("./common/dbconn");
var testData = require("./common/testData");
var defaultHostName = dbconn.defaultHostName;
var credentials = dbconn.credentials;

describe('Catch-Up Subscription', function() {
    var testStreams = [];

    context('setting up basic subscription', function () {
        it('should succeed', function (done) {
            dbconn.open(done, function (connection) {
                var actualEventNumbers = [];
                var streamName = testData.randomStreamName();
                testStreams.push(streamName);

                var settings = new EventStoreClient.CatchUpSubscription.Settings();
                
                testData.writeEvents(
                    connection, credentials, streamName, 10,
                    testData.fooEvent,
                    function () {
                        connection.subscribeToStreamFrom(
                            streamName, 6, credentials,
                            function (event) {
                                actualEventNumbers.push(event.eventNumber);
                            },
                            function () {
                                assert.deepEqual(actualEventNumbers, [7, 8, 9]);
                                done();
                            },
                            function () {
                                assert.fail(null, null, 'Subscription dropped!');
                                done;
                            },
                            settings);
                    });
            });
        });
    });

    after(function () {
        dbconn.open(null, function (connection) {
            testData.deleteTestStreams(connection, credentials, testStreams);
        });
    });
});