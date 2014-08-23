var ProtoBuf = require('protobufjs');
var builder = ProtoBuf.loadProtoFile('ClientMessageDtos.proto');
var EventStore = builder.build();
var Messages = EventStore.EventStore.Client.Messages;
module.exports = Messages;