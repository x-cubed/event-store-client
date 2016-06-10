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
                                done();
                            },
                            settings);
                    });
            });
        });

        it('can process additional events live', function (done) {
            dbconn.open(done, function (connection) {
                var actualEventNumbers = [];
                var liveProcessingStarted = false;
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

                                if (liveProcessingStarted && event.eventNumber >= 12) {
                                    assert.deepEqual(actualEventNumbers, [7, 8, 9, 10, 11, 12]);
                                    done();
                                }
                            },
                            function () {
                                liveProcessingStarted = true;
                                testData.writeEvents(
                                    connection, credentials, streamName, 3,
                                    testData.fooEvent,
                                    function () {});
                            },
                            null,
                            settings);
                    });
            });
        });

        it('should succeed when reading events in small pages', function (done) {
            dbconn.open(done, function (connection) {
                var actualEventNumbers = [];
                var streamName = testData.randomStreamName();
                testStreams.push(streamName);

                var settings = new EventStoreClient.CatchUpSubscription.Settings();
                settings.readBatchSize = 2;

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
                                done();
                            },
                            settings);
                    });
            });
        });
    });

    context('dropping basic subscription', function () {
        it('should succeed', function (done) {
            dbconn.open(done, function (connection) {
                var streamName = testData.randomStreamName();
                testStreams.push(streamName);

                var settings = new EventStoreClient.CatchUpSubscription.Settings();

                testData.writeEvents(
                    connection, credentials, streamName, 10,
                    testData.fooEvent,
                    function () {
                        var subscription =
                            connection.subscribeToStreamFrom(
                                streamName, 6, credentials,
                                function (event) {},
                                function () {
                                    subscription.stop();
                                },
                                function () {
                                    done();
                                },
                                settings);
                    });
            });
        });

        it('should handle it when event callback throws an error', function (done) {
            dbconn.open(done, function (connection) {
                var streamName = testData.randomStreamName();
                testStreams.push(streamName);

                var settings = new EventStoreClient.CatchUpSubscription.Settings();

                testData.writeEvents(
                    connection, credentials, streamName, 10,
                    testData.fooEvent,
                    function () {
                        var subscription =
                            connection.subscribeToStreamFrom(
                                streamName, 6, credentials,
                                function (event) { throw new Error('unable to cope with existence'); },
                                function () {},
                                function (subscription, reason, err) {
                                    assert.equal(reason, 'CatchUpError');
                                    assert.equal(err.message, 'unable to cope with existence');
                                    done();
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