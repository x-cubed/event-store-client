Event Store Client
==================
Author: Carey Bishop

Connects to an [Event Store](http://geteventstore.com) server over TCP/IP, to send and receive event information.

The Javascript API is intended to mimic the .Net API as closely as possible.

For an example of how to use it, see [example.js](example.js).

# Installation
At the command-line:
> npm install event-store-client

In your Node.js application:
> var EventStore = require('event-store-client');

A Typescript type definition is available in [event-store-client.d.ts](event-store-client.d.ts). Add this line to the top of your Typescript application:
> /// &lt;reference path='node_modules/event-store-client/event-store-client.d.ts'/&gt;

# API

## Connection object
The core class in this library, represents a single TCP connection to an Event Store server.

### new EventStore.Connection(options)
Creates a new Connection object and establishes a binary TCP connection the Event Store server.

Options is an object containing the following properties:

* host - The domain name or IP address of the Event Store server (string, default: localhost)
* port - The port number to use (number, default: 1113)
* debug - A flag to toggle the output of packets to the console as they're sent and received (boolean, default: false)
* onConnect - A function to be called with no parameters when the connection is established (function, default: no-op)
* onError - A function to be called with a single parameter containing the error that was encountered (function, default: write error to console)

### Connection.close()
Closes the TCP connection. To re-establish the connection, construct a new Connection object.

### Connection.createGuid()
Helper function to generate GUIDs as Buffer objects, for use as the eventId value for new events.

### Connection.sendPing()
Sends a ping request to the server.

* callback - The callback function will be invoked when the server responds with a pong.

### Connection.subscribeToStream()
Subscribes to a stream to receive notifications as soon as an event is written to the stream.

* streamId - The name of the stream in the Event Store (string)
* resolveLinkTos - True, to resolve links to events in other streams (boolean)
* onEventAppeared - A function to be called each time an event is written to the stream (function, takes in a [StoredEvent](#storedevent-class) object)
* onConfirmed - A function to be called when the server has confirmed that the subscription is running (function, takes in an [ISubscriptionConfirmation]((#isubscriptionconfirmation-interface)))
* onDropped - A function to be called when the subscription is cancelled (function, takes in an [ISubscriptionDropped](#isubscriptiondropped-interface))
* credentials - The user name and password needed for permission to subscribe to the stream ([ICredentials](#icredentials-interface), optional)

Returns a Buffer containing a GUID that identifies the subscription, for use with unsubscribeStream().

### Connection.readAllEventsBackward() / Connection.readAllEventsForward()
Reads events from across all streams, in order (backward = newest first, forward = oldest first).

* commitPosition - The commit position to start from
* preparePosition - The prepare position to start from
* maxCount - The maximum number of events to return (counting down from fromEventNumber)
* resolveLinkTos - True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
* requireMaster - True, if this request must be processed by the master server in the cluster
* onEventAppeared - The callback to be fired for each event that was written to the stream (can be null)
* credentials - The username and password needed to perform the operation on this stream
* callback  - The callback to be fired once all the events have been retrieved


### Connection.readStreamEventsBackward() / Connection.readStreamEventsForward()
Reads events from a specific stream, in order (backward = newest first, forward = oldest first).

* streamId - The name of the stream (string)
* fromEventNumber - The number of the event to start at
* maxCount - The maximum number of events to return (counting down from fromEventNumber)
* resolveLinkTos - True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
* requireMaster - True, if this request must be processed by the master server in the cluster
* onEventAppeared - The callback to be fired for each event that was written to the stream (can be null)
* credentials - The username and password needed to perform the operation on this stream ([ICredentials](#icredentials-interface), optional)
* callback  - The callback to be fired once all the events have been retrieved

### Connection.unsubscribeFromStream()
Cancels an existing subscription to a stream.

* correlationId - The GUID identifying the subscription, returned by subscribeToStream (Buffer)
* credentials - The username and password needed to perform the operation on this stream ([ICredentials](#icredentials-interface), optional)
* callback - The callback to be fired once the subscription has been cancelled (function, no parameters)

### Connection.writeEvents()
Writes one or more events to a stream, creating the stream if it doesn't exist.

* streamId - The name of the stream (string)
* expectedVersion - The expected version of the stream (ie: number of the most recent event) or ExpectedVersion.Any
* requireMaster - True, if this request must be processed by the master server in the cluster
* events - An array of events to be written to the stream ([Event](#event)[])
* credentials - The username and password need to perform the operation on this stream ([ICredentials](#icredentials-interface), optional)
* callback - Invoked once the operation has been completed. Check the result to confirm it was successful.

## Event class
Represents an event either before or after it has been stored.

* eventId - A GUID uniquely identifying this event (string)
* eventType - The type of event (string)
* data - An object to be JSON-serialized as the data for the event (object, optional)

## StoredEvent class
Represents an event as it exists on the Event Store server. Inherits from Event and adds the following properties:

* streamId - The name of the Event Store stream that this event was stored in (string)
* eventNumber - The sequence number for this event within the stream (number)
* created - The date that this event was stored in the Event Store (date)
* link - If event was read from a stream using the resolveLinkTos flag, will contain the original link data (from before the event was resolved.) (StoredEvent)

## ICredentials interface
An object containing credentials for access to secured resources.

* username - The name of the Event Store user (string)
* password - The clear-text password of the Event Store user (string)

## ISubscriptionConfirmation interface
Passed to the onConfirmed callback used by subscribeToStream() when a subscription is successfully created.

* lastCommitPosition - The last commit position within the stream (number)
* lastEventNumber - The last event number within the stream (number)

## ISubscriptionDropped interface
Passed to the onDropped callback used by subscribeToStream() when a subscription terminates, or cannot be established.

* reason - The reason why the subscription was dropped (enumeration, 0 = Unsubscribed, 1 = Access Denied)