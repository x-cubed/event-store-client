var ProtoBuf, path, protoFile, builder, EventStore;
path = require('path');
ProtoBuf = require('protobufjs');
ProtoBuf.convertFieldsToCamelCase = true; // field_name => fieldName

// Parse the ProtoBuf definition file into a bunch of JS objects
protoFile = path.resolve(__dirname, '..', 'ClientMessageDtos.proto');
builder = ProtoBuf.loadProtoFile(protoFile);
EventStore = builder.build();

module.exports = EventStore.EventStore.Client.Messages;