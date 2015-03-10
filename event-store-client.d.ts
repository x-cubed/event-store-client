declare module "event-store-client" {
	export enum ExpectedVersion {
		Any = -2,
		NoStream = -1
	}

	export enum OperationResult {
	    Success = 0,
	    PrepareTimeout = 1,
	    CommitTimeout = 2,
	    ForwardTimeout = 3,
	    WrongExpectedVersion = 4,
	    StreamDeleted = 5,
	    InvalidTransaction = 6,
	    AccessDenied = 7
	}

	export enum ReadEventResult {
		Success = 0,
		NotFound = 1,
		NoStream = 2,
		StreamDeleted = 3,
		Error = 4,
		AccessDenied = 5
	}

	export enum ReadStreamResult {
		Success = 0,
		NoStream = 1,
		StreamDeleted = 2,
		NotModified = 3,
		Error = 4,
		AccessDenied = 5
	}

	export enum ReadAllResult {
		Success = 0,
		NotModified = 1,
		Error = 2,
		AccessDenied = 3
	}

	export enum SubscriptionDropReason {
		Unsubscribed = 0,
		AccessDenied = 1
	}

	export enum NotHandledReason {
		NotReady = 0,
		TooBusy = 1,
		NotMaster = 2
	}

	export interface ICredentials {
		username: string;
		password: string;
	}

	export interface Event {
		eventId: string;
		eventType: string;
		data: any;
	}

	export interface StoredEvent extends Event {
		streamId: string;
		number: number;
		created: Date;
	}

	export interface IOperationCompleted {
		result: OperationResult;
		message: string;
	}

	export interface IWriteEventsCompleted extends IOperationCompleted {
		firstEventNumber: number;
		lastEventNumber: number;
		preparePosition: number;
		commitPosition: number;
	}

	export interface IReadAllEventsCompleted {
		commitPosition: number;
		preparePosition: number;
		events: any;
		nextCommitPosition: number;
		nextPreparePosition: number;
		result: ReadAllResult;
		error: string;
	}

	export interface IReadStreamEventsCompleted {
		events: any;
		result: ReadStreamResult;
		nextEventNumber: number;
		lastEventNumber: number;
		isEndOfStream: boolean;
		lastCommitPosition: number;
		error: string;
	}

	export interface IDeleteStreamCompleted extends IOperationCompleted {
		preparePosition: number;
		commitPosition: number
	}

	export interface ISubscriptionConfirmation {
		lastCommitPosition: number;
		lastEventNumber: number;
	}

	export interface ISubscriptionDropped {
		reason: SubscriptionDropReason;
	}

	/***
	 * Represents a binary TCP connection to an instance of Event Store
	 */
	export class Connection {
		/***
		 * Creates a new TCP connection the Event Store host
		 * @param options host - the IP address or host name of the host to connect to, port - the TCP port number to connect on, debug - optional boolean flag to enable debug output to the console
		 */
		constructor(options: any);

		/***
		 * Closes the TCP connection
		 */
		close(): void;

		/***
		 * Helper function to create a new v4 UUID to use for event IDs or correlation IDs
		 */
		createGuid(): Buffer;

		/***
		 * Deletes a stream from the server
		 * @param streamId The name of the stream
		 * @param expectedVersion The expected version of the stream (ie: number of the most recent event) or ExpectedVersion.Any
		 * @param requireMaster True, if this request must be processed by the master server in the cluster
		 * @param hardDelete True, if the stream should be completely removed, rather than just marking it as deleted
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @param callback Invoked when the operation is completed. Check the result to confirm it was successful.
		 */
		deleteStream(streamId: string, expectedVersion: number, requireMaster: boolean, hardDelete: boolean, credentials: ICredentials, callback: (completed: IDeleteStreamCompleted) => void): void;

		/***
		 * Sends a ping request to the server to ensure that the connection is still alive. The server should respond immediately.
		 * @param callback Invoked when the pong is received from the server
		 */
		sendPing(callback: () => void): void;

		/***
		 * Subscribes to receive events from a stream as they occur
		 * @param streamId The name of the stream
		 * @param resolveLinkTos True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
		 * @param onEventAppeared The callback to be fired each time an event is written to the stream
		 * @param onConfirmed The callback to be fired once the server confirms that the subscription is in place
		 * @param onDropped The callback to be fired when the server terminates the subscription
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @return {Buffer} The correlation ID for this subscription, needed for unsubscribeFromStream.
		 */
		subscribeToStream(streamId: string, resolveLinkTos: boolean, onEventAppeared: (event: StoredEvent) => void, onConfirmed: (confirmation: ISubscriptionConfirmation) => void, onDropped: (dropped: ISubscriptionDropped) => void, credentials: ICredentials): Buffer;

		/***
		 * Reads events from across all streams, in order from newest to oldest
		 * @param commitPosition The commit position to start from
		 * @param preparePosition The prepare position to start from
		 * @param maxCount The maximum number of events to return (counting down from fromEventNumber)
		 * @param resolveLinkTos True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
		 * @param requireMaster True, if this request must be processed by the master server in the cluster
		 * @param onEventAppeared The callback to be fired for each event that was written to the stream (can be null)
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @param callback The callback to be fired once all the events have been retrieved
		 */
		readAllEventsBackward(commitPosition: number, preparePosition: number, maxCount: number, resolveLinkTos: boolean, requireMaster: boolean, onEventAppeared: (event: StoredEvent) => void, credentials: ICredentials, callback: (completed: IReadAllEventsCompleted) => void): void;

		/***
		 * Reads events from across all streams, in order from oldest to newest
		 * @param commitPosition The commit position to start from
		 * @param preparePosition The prepare position to start from
		 * @param maxCount The maximum number of events to return (counting down from fromEventNumber)
		 * @param resolveLinkTos True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
		 * @param requireMaster True, if this request must be processed by the master server in the cluster
		 * @param onEventAppeared The callback to be fired for each event that was written to the stream (can be null)
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @param callback The callback to be fired once all the events have been retrieved
		 */
		readAllEventsForward(commitPosition: number, preparePosition: number, maxCount: number, resolveLinkTos: boolean, requireMaster: boolean, onEventAppeared: (event: StoredEvent) => void, credentials: ICredentials, callback: (completed: IReadAllEventsCompleted) => void): void;

		/***
		 * Reads events from a specific stream, in order from newest to oldest
		 * @param streamId The name of the stream
		 * @param fromEventNumber The number of the event to start at
		 * @param maxCount The maximum number of events to return (counting down from fromEventNumber)
		 * @param resolveLinkTos True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
		 * @param requireMaster True, if this request must be processed by the master server in the cluster
		 * @param onEventAppeared The callback to be fired for each event that was written to the stream (can be null)
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @param callback The callback to be fired once all the events have been retrieved
		 */
		readStreamEventsBackward(streamId: string, fromEventNumber: number, maxCount: number, resolveLinkTos: boolean, requireMaster: boolean, onEventAppeared: (event: StoredEvent) => void, credentials: ICredentials, callback: (completed: IReadStreamEventsCompleted) => void): void;

		/***
		 * Reads events from a specific stream, in order from oldest to newest
		 * @param streamId The name of the stream
		 * @param fromEventNumber The number of the event to start at (use 0 for the first event)
		 * @param maxCount The maximum number of events to return (counting up from fromEventNumber)
		 * @param resolveLinkTos True, if links to events from other streams should be resolved (ie: for events re-published by a projection)
		 * @param requireMaster True, if this request must be processed by the master server in the cluster
		 * @param onEventAppeared The callback to be fired for each event that was written to the stream (can be null)
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @param callback The callback to be fired once all the events have been retrieved
		 */
		readStreamEventsForward(streamId: string, fromEventNumber: number, maxCount: number, resolveLinkTos: boolean, requireMaster: boolean, onEventAppeared: (event: StoredEvent) => void, credentials: ICredentials, callback: (completed: IReadStreamEventsCompleted) => void): void;

		/***
		 * Unsubscribes from a stream
		 * @param correlationId The correlation ID Buffer returned by subscribeToStream
		 * @param credentials The username and password needed to perform the operation on this stream
		 * @param callback Invoked when the operation is completed
		 */
		unsubscribeFromStream(correlationId: Buffer, credentials: ICredentials, callback: () => void): void;

		/***
		 * Writes one or more events to a stream, creating it if it doesn't exist
		 * @param streamId The name of the stream
		 * @param expectedVersion The expected version of the stream (ie: number of the most recent event) or ExpectedVersion.Any
		 * @param requireMaster True, if this request must be processed by the master server in the cluster
		 * @param events An array of events to be written to the stream
		 * @param credentials The username and password need to perform the operation on this stream
		 * @param callback Invoked once the operation has been completed. Check the result to confirm it was successful.
		 */
		writeEvents(streamId: string, expectedVersion: number, requireMaster: boolean, events: Event[], credentials: ICredentials, callback: (completed: IWriteEventsCompleted) => void): void;
	}
}