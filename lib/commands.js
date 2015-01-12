// Event Store TCP Commands
var Commands = {
	HeartbeatRequest:                  0x01,
	HeartbeatResponse:                 0x02,

	Ping:                              0x03,
	Pong:                              0x04,

	// ...

	Read:                              0xB0,
    ReadEventCompleted:                0xB1,
    ReadStreamEventsForward:           0xB2,
    ReadStreamEventsForwardCompleted:  0xB3,
    ReadStreamEventsBackward:          0xB4,
    ReadStreamEventsBackwardCompleted: 0xB5,
    ReadAllEventsForward:              0xB6,
    ReadAllEventsForwardCompleted:     0xB7,
    ReadAllEventsBackward:             0xB8,
    ReadAllEventsBackwardCompleted:    0xB9,

	SubscribeToStream:                 0xC0,
    SubscriptionConfirmation:          0xC1,
    StreamEventAppeared:               0xC2,
    UnsubscribeFromStream:             0xC3,
    SubscriptionDropped:               0xC4,

    // ...
    BadRequest:                        0xF0,
    NotHandled:                        0xF1,
    Authenticate:                      0xF2,
    Authenticated:                     0xF3,
    NotAuthenticated:                  0xF4,

    /***
     * Returns a nice name for a TCP Command ID
     */
    getCommandName: function(command) {
        for(var key in Commands) {
            if (Commands.hasOwnProperty(key)) {
                if (Commands[key] == command) {
                    return key;
                }
            }
        }
        return command.toString();
    }
};

module.exports = Commands;