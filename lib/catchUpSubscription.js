/**
 * This module is a port of the catch-up subscription functionality from 
 * Event Store's official .NET client. Primarily, it's a port of the C# module 
 * EventStoreCatchUpSubscription: https://github.com/EventStore/EventStore/blob/release-v3.7.0/src/EventStore.ClientAPI/EventStoreCatchUpSubscription.cs
 * 
 * NOTABLE DIFFERENCES
 * 
 * - Instead of passing a logger object and a Verbose flag, we accept a simple debug flag, which, if 
 *   set to true, will cause console log messages to be written in the places where the C# client would have 
 *   written to the logger (verbose mode or no). This behavior more closely matches that of the existing Node 
 *   client so far.
 * 
 * - No reconnect handling. The Connection object in this Node client currently does not emit anything like a Connect 
 *   event, so there is no way to hook into such an occurrence. 
 * 
 * - Handles event processing in the main thread, following Node's convention of async/single-threaded execution, 
 *   expecting good async, non-blocking behavior from any client using this package. 
 */

(function (catchUpSubscription) {
    
    var ArgValidator = require('argument-validator');

    // CONSTANTS
    const DefaultReadBatchSize = 500;
    const MaxReadSize = 4096;
    const DefaultMaxPushQueueSize = 10000;

    /**
     * Settings for <tt>EventStoreCatchUpSubscription</tt>
     * 
     * @constructor
     * @param {number} maxLiveQueueSize The max amount to buffer when processing from live subscription. 
     * @param {number} readBatchSize The number of events to read per batch when reading history
     * @param {boolean} debug True iff in debug mode
     * @param {boolean} resolveLinkTos Whether or not to resolve link events 
     */
    function CatchUpSubscriptionSettings(maxLiveQueueSize, readBatchSize, debug, resolveLinkTos) {
        // Validate arguments (supplying defaults where arguments are null or missing). 
        if (arguments.length < 4 || resolveLinkTos == null) {
            resolveLinkTos = false;
        } else {
            ArgValidator.boolean(resolveLinkTos, 'resolveLinkTos');
        }
        if (arguments.length < 3 || debug == null) {
            debug = false;
        } else {
            ArgValidator.boolean(debug, 'debug');
        }
        if (arguments.length < 2 || readBatchSize == null) {
            readBatchSize = DefaultReadBatchSize;
        } else {
            ArgValidator.number(readBatchSize, 'readBatchSize');
        }
        if (arguments.length < 1 || maxLiveQueueSize == null) {
            maxLiveQueueSize = DefaultMaxPushQueueSize;
        } else {
            ArgValidator.number(maxLiveQueueSize, 'maxLiveQueueSize');
        }

        if (readBatchSize > MaxReadSize) throw new Error("Read batch size should be less than " + MaxReadSize.toString() + ". For larger reads you should page.");

        this.maxLiveQueueSize = maxLiveQueueSize;
        this.readBatchSize = readBatchSize;
        this.debug = debug;
        this.resolveLinkTos = resolveLinkTos;
    }

    /**
     * Base class representing catch-up subscriptions.
     * 
     * @constructor
     * @param {Connection} connection The connection to Event Store
     * @param {string} streamId The stream name (only if subscribing to a single stream)
     * @param userCredentials User credentials for the operations.
     * @param {function} eventAppeared Callback for each event received
     * @param {function} liveProcessingStarted Callback when read history phase finishes.
     * @param {function} subscriptionDropped Callback when subscription drops or is dropped.
     * @param {CatchUpSubscriptionSettings} settings Settings for this subscription.
     */
    function EventStoreCatchUpSubscription(connection, streamId, userCredentials, eventAppeared, liveProcessingStarted, subscriptionDropped, settings) {
        ArgValidator.notNull(connection, 'connection');
        ArgValidator.notNull(eventAppeared, 'eventAppeared');

        this._connection = connection;
        this._streamId = streamId || "";
        this._resolveLinkTos = _resolveLinkTos;
        this._userCredentials = userCredentials;
        this.readBatchSize = settings.readBatchSize;
        this.maxPushQueueSize = settings.maxLiveQueueSize;
        this.eventAppeared = eventAppeared;
        this._liveProcessingStarted = liveProcessingStarted;
        this._subscriptionDropped = subscriptionDropped;
        this.debug = settings.debug;
        this._shouldStop = false;
        this._dropData = null;
        this._liveQueue = [];
        this._allowProcessing = false;
        this._subscription = null;
    }

    /**
     * Accept parameters to pass on to console.log. 
     */
    EventStoreCatchUpSubscription.prototype._log = function () {
        if (this.debug) console.log.apply(console, arguments);
    };

    /**
     * Indicates whether the subscription is to all events or to a specific stream.
     */
    EventStoreCatchUpSubscription.prototype.isSubscribedToAll = function () { return this._streamId.length == 0; };

    EventStoreCatchUpSubscription.prototype.start = function () {
        this._log("Catch-up Subscription to %s: starting...", this.isSubscribedToAll ? "<all>" : this._streamId);
        this.runSubscription();
    };

    /**
     * Attempts to stop the subscription without blocking for completion of stop
     */
    EventStoreCatchUpSubscription.prototype.stop = function() {
        this._log("Catch-up Subscription to %s: requesting stop...", this.isSubscribedToAll() ? "<all>" : this._streamId);
        this._shouldStop = true;
        this.enqueueSubscriptionDropNotification('UserInitiated', null);
    };
    
    EventStoreCatchUpSubscription.prototype.runSubscription = function () {
        this.loadHistoricalEvents(this.handleError.bind(this));
    };

    EventStoreCatchUpSubscription.prototype.loadHistoricalEvents = function(callback) {
        this._log("Catch-up Subscription to %s: running...", this.isSubscribedToAll() ? "<all>" : this._streamId);

        this._allowProcessing = false;

        if (!this._shouldStop) {
            this._log("Catch-up Subscription to %s: pulling events...", this.isSubscribedToAll() ? "<all>" : this._streamId);

            this.readEventsTill(null, null, function(err) {
                if (err) {
                    if (callback) callback(err);
                } else {
                    this.subscribeToStream(callback);
                }
            });
        } else {
            this.dropSubscription('UserInitiated');
            if (callback) callback();
        }
    };

    EventStoreCatchUpSubscription.prototype.subscribeToStream = function(callback) {
        if (!this._shouldStop) {
            this._log("Catch-up Subscription to %s: subscribing...", this.isSubscribedToAll() ? "<all>" : this._streamId);

            if (this.isSubscribedToAll()) {
                callback(new Error('Cannot do catch-up subscription to all at this time. Not implemented: connection.subscribeToAll'));
            } else {
                var subscriptionId = 
                    this._connection.subscribeToStream(
                        this._streamId, this._resolveLinkTos, 
                        this.enqueuePushedEvent.bind(this), 
                        function(confirmation) {
                            this._subscription = {
                                correlationId: subscriptionId,
                                lastCommitPosition: confirmation.last_commit_position,
                                lastEventNumber: confirmation.last_event_number
                            };
                            this.readMissedHistoricEvents(callback);
                        }, 
                        this.serverSubscriptionDropped.bind(this), 
                        this._userCredentials);
            }
        } else {
            this.dropSubscription('UserInitiated');
            if (callback) callback();
        }
    };

    EventStoreCatchUpSubscription.prototype.readMissedHistoricEvents = function (callback) {
        if (!this._shouldStop) {
            this._log("Catch-up Subscription to %s: pulling events (if left)...", this.isSubscribedToAll() ? "<all>" : this._streamId);

            this.readEventsTill(this._subscription.lastCommitPosition, this._subscription.lastEventNumber, function (err) {
                if (err) {
                    if (callback) callback(err);
                } else {
                    this.startLiveProcessing(callback);
                }
            });
        } else {
            this.dropSubscription('UserInitiated');
            if (callback) callback();
        }
    };

    EventStoreCatchUpSubscription.prototype.startLiveProcessing = function (callback) {
        if (this._shouldStop) {
            this.dropSubscription('UserInitiated');
            if (callback) callback();
            return;
        }

        this._log("Catch-up Subscription to %s: processing live events...", this.isSubscribedToAll() ? "<all>" : this._streamId);

        if (this._liveProcessingStarted) this._liveProcessingStarted();

        this._allowProcessing = true;
        this.processLiveQueue();
        if (callback) callback();
    };

    EventStoreCatchUpSubscription.prototype.enqueuePushedEvent = function(event) {
        var origEvent = event.link || event;
        this._log("Catch-up Subscription to %s: event appeared (%s, %d, %s).",
                    this.isSubscribedToAll() ? "<all>" : this._streamId,
                    origEvent.streamId, origEvent.eventNumber, origEvent.eventType);

        if (this._liveQueue.length >= this.maxPushQueueSize) {
            this.enqueueSubscriptionDropNotification('ProcessingQueueOverflow');
            return;
        }

        this._liveQueue.push(event);

        if (this._allowProcessing) this.processLiveQueue();
    };

    EventStoreCatchUpSubscription.prototype.serverSubscriptionDropped = function(dropped) {
        this.enqueueSubscriptionDropNotification(dropped.reason);
    };

    EventStoreCatchUpSubscription.prototype.enqueueSubscriptionDropNotification = function(reason, err) {
        // if drop data was already set -- no need to enqueue drop again, somebody did that already
        if (this._dropData == null) {
            this._dropData = { reason: reason, error: err };
            this._liveQueue.push(this.dropSubscriptionEvent());
            if (_allowProcessing) this.processLiveQueue();
        }
    };

    EventStoreCatchUpSubscription.prototype.handleError = function(err) {
        if (err) {
            this.dropSubscription('CatchUpError', err);
        }
    };

    EventStoreCatchUpSubscription.prototype.processLiveQueue = function() {
        var e;
        while (e = this._liveQueue.shift()) {
            if (e.specialType == 'DropSubscription') {
                if (this._dropData == null) this._dropData = { reason: 'Unknown', error: new Error('Drop reason not specified') };
                this.dropSubscription(this._dropData.reason, this._dropData.error);
                return;
            }
            this.tryProcess(e, function(err) {
                if (err) {
                    this.dropSubscription('EventHandlerException', err);
                }
            });
        }
    };

    EventStoreCatchUpSubscription.prototype.dropSubscriptionEvent = function() { return { specialType: 'DropSubscription' }; };

    EventStoreCatchUpSubscription.prototype.dropSubscription = function(reason, err) {
        this._log("Catch-up Subscription to %: dropping subscription, reason: %s %s.",
                  this.isSubscribedToAll() ? "<all>" : this._streamId, reason, err == null ? "" : err.toString());

        if (this._subscription != null) {
            this._connection.unsubscribeFromStream(this._subscription.correlationId, this._userCredentials, function(pkg) {
                this._subscription = null;
                if (this._subscriptionDropped) {
                    this._subscriptionDropped(this, reason, err);
                }
            });
        }
    };

    /*
    function EventStoreAllCatchUpSubscription {
        // NOT IMPLEMENTED because there is no connection.subscribeToAll yet...
    }
    */

    /**
     * Catch-up subscription for one stream.
     * 
     * @constructor
     * @param {Connection} connection The connection to Event Store
     * @param {string} streamId The stream name (only if subscribing to a single stream)
     * @param {number} fromEventNumberExclusive Which event number to start from (if null, then from the beginning of the stream.)
     * @param userCredentials User credentials for the operations.
     * @param {function} eventAppeared Callback for each event received
     * @param {function} liveProcessingStarted Callback when read history phase finishes.
     * @param {function} subscriptionDropped Callback when subscription drops or is dropped.
     * @param {CatchUpSubscriptionSettings} settings Settings for this subscription.
     */
    function EventStoreStreamCatchUpSubscription(connection, streamId, fromEventNumberExclusive, userCredentials, eventAppeared, liveProcessingStarted, subscriptionDropped, settings) {
        // Base class constructor (JS-style).
        EventStoreCatchUpSubscription.call(this, connection, streamId, userCredentials, eventAppeared, liveProcessingStarted, subscriptionDropped, settings);

        ArgValidator.notNull(streamId, 'streamId');

        this._lastProcessedEventNumber = ArgValidator.isNumber(fromEventNumberExclusive) ? fromEventNumberExclusive : -1;
        this._nextReadEventNumber = ArgValidator.isNumber(fromEventNumberExclusive) ? fromEventNumberExclusive : 0;
    }

    // Wire up prototypal inheritance.
    Object.setPrototypeOf(EventStoreStreamCatchUpSubscription.prototype, EventStoreCatchUpSubscription.prototype);

    /**
     * Read events until the given event number async.
     * 
     * @param {number} lastCommitPosition The commit position to read until.
     * @param {number} lastEventNumber The event number to read until.
     */
    EventStoreStreamCatchUpSubscription.prototype.readEventsTill = function (lastCommitPosition, lastEventNumber, callback) {
        var nextReadEventNumber = this._nextReadEventNumber;
        var _this = this;

        this._connection.readStreamEventsForward(
            this._streamId, this._nextReadEventNumber, this.readBatchSize, this._resolveLinkTos, false,
            function (event) {
                _this.tryProcess(event);
                nextReadEventNumber = (event.link ? event.link.eventNumber : event.eventNumber) + 1;
            },
            this._userCredentials,
            function (err) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                var isEndOfStream = nextReadEventNumber == _this._nextReadEventNumber; // Didn't read any events.
                var done = lastEventNumber == null ? isEndOfStream : nextReadEventNumber > lastEventNumber;
                _this._nextReadEventNumber = nextReadEventNumber;

                if (!done && !_this._shouldStop) {
                    setTimeout(
                        function () {
                            _this.readEventsTill(lastCommitPosition, lastEventNumber, callback);
                        },
                        isEndOfStream ? 1 : 0  // Waiting for server to flush its data...
                    );
                } else {
                    _this._log("Catch-up Subscription to %s: finished reading events, nextReadEventNumber = %d.",
                        _this.isSubscribedToAll() ? "<all>" : _this._streamId, _this._nextReadEventNumber);

                    if (callback) callback();
                }
            });
    };

    /**
     * Try to process a single resolved event.
     * 
     * @param event The resolved event to process.
     */
    EventStoreStreamCatchUpSubscription.prototype.tryProcess = function (event) {
        var origEvent = event.link || event;
        var processed = false;

        if (origEvent.eventNumber > this._lastProcessedEventNumber) {
            this.eventAppeared(event);
            this._lastProcessedEventNumber = origEvent.eventNumber;
            processed = true;
        }

        _this._log("Catch-up Subscription to %s: %s event (%s, %d, %s)",
                        _this.isSubscribedToAll() ? "<all>" : _this._streamId,
                        processed ? "processed" : "skipping", 
                        origEvent.streamId, origEvent.eventNumber, origEvent.eventType);
    };

    // EXPOSE public types.
    catchUpSubscription.Settings = CatchUpSubscriptionSettings;
    catchUpSubscription.Stream = EventStoreStreamCatchUpSubscription;

})(module.exports);

