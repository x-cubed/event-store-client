var ProtoBuf, builder, EventStore;
ProtoBuf = require('protobufjs');
ProtoBuf.convertFieldsToCamelCase = true; // field_name => fieldName

// Parse the ProtoBuf definition file into a bunch of JS objects
builder = ProtoBuf.loadProtoFile('ClientMessageDtos.proto');
EventStore = builder.build();

module.exports = EventStore.EventStore.Client.Messages;