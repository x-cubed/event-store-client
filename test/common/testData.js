/**
 * Utilities for creating and managing test streams and events. 
 */
(function (testData) {

    var uuidv4 = require('uuid/v4');
    var EventStoreClient = require("../../index.js");

    /**
     * Returns a stream name composed of the prefix "test-" and a random UUID.
     */
    testData.randomStreamName = function() {
        return 'test-' + uuidv4();
    };

    /**
     * Creates meaningless stub Event object as filler.
     */
    testData.fooEvent = function() {
        return {
            eventId: uuidv4(),
            eventType: 'ThingHappened',
            data: { foo: true }
        };
    }

    /**
     * Generates the specified number of Event objects and returns them as an array.
     * 
     * @param {number} totalEvents The number of events to generate.
     * @param {function} getEvent Function that takes a number (i), which is the 0-based index of the event being created, and returns the Event.
     * @returns Array of generated events. 
     */
    testData.generateEvents = function (totalEvents, getEvent) {
        var events = [];
        for (var i = 0; i < totalEvents; i++) {
            events.push(getEvent(i));
        }
        return events;
    }

    /**
     * Generates the specified number of Event objects and writes them to Event Store.
     * 
     * @param {Connection} connection Connection to Event Store.
     * @param {ICredentials} credentials Credentials for writing events to Event Store.
     * @param {string} streamName Name of stream to write to. 
     * @param {number} totalEvents The number of events to generate.
     * @param {function} getEvent Function that takes a number (i), which is the 0-based index of the event being created, and returns the Event.
     * @param {function} callback Callback function for when writing events is done. 
     * @returns Array of generated events. 
     */
    testData.writeEvents = function(connection, credentials, streamName, totalEvents, getEvent, callback) {
        var events = testData.generateEvents(totalEvents, getEvent);
        connection.writeEvents(streamName, EventStoreClient.ExpectedVersion.Any, false, events, credentials, callback);
    };

    /**
     * Deletes the specified streams from Event Store. 
     * SAFETY FEATURE: will only delete streams that begin with 'test-'. 
     * 
     * @param {Connection} connection Connection to Event Store.
     * @param {ICredentials} credentials Credentials for writing events to Event Store.
     * @param {array} streamNames Array of names of stream to delete. 
     * @param {function} callback Callback function for when deleting streams is done. 
     * @returns Array of generated events. 
     */
    testData.deleteTestStreams = function (connection, credentials, streamNames, callback) {
        if (streamNames.length == 0) {
            if (callback) callback();
        } else {
            connection.deleteStream(streamNames[0], EventStoreClient.ExpectedVersion.Any, false, true, credentials, function (completed) {
                if (completed.result != 5 && completed.result != 0) {
                    console.log('Error deleting test stream %s (%d): %s', streamNames[0], completed.result, completed.message);
                }
                testData.deleteTestStreams(connection, credentials, streamNames.slice(1), callback); // Delete the rest.
            });
        }
    };

})(module.exports);