/***
 * To run these tests, install Event Store on a machine, and point the alias eventstore to it, by defining it in your HOSTS file or DNS.
 * You can test against a copy of Event Store on localhost by putting "127.0.0.1 eventstore" in your HOSTS file.
  */

(function(dbconn) {

    dbconn.defaultHostName = "eventstore";
    dbconn.credentials = {
        username: "admin",
        password: "changeit"
    };

})(module.exports);