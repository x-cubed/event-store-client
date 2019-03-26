1.1.0 (26 March 2019)
- FEATURE: Add support for TLS connections (Digi-Cazter, morrislaptop)

1.0.1 (5 January 2019)
- CHANGE: Run the tests inside a Docker container for reproducibility and to provide a path forward for testing TLS support (x-cubed)

1.0.0 (3 February 2018)
- CHANGE: Upgrade from deprecated node-uuid to uuid package (ImmaculatePine)

0.0.11 (4 March 2017)
- FIX: added types property to the package.json so that TypeScript 2+ can find the type definitions file (guyspronck)

0.0.10 (30 August 2016)
- FEATURE: support for handling subscriptions that are received by the server but unable to be handled at the time (joeywinsford)

0.0.9 (19 July 2016)
- FEATURE: support for reading and writing event metadata in JSON and binary format (joeywinsford)

0.0.8 (13 July 2016)
- FEATURE: handling socket close events for when the server closes the connection (deyhle)
- FIX: reading of resolved links to events where the event is null (MarshallRJ)
- FIX: catchUpSubscription require statement having the incorrect casing (x-cubed)

0.0.7 (12 June 2016)
- FEATURE: support for catch-up subscriptions (ZBlocker655)
- CHANGE: Mark createGuid as a static method in the Typescript definition (x-cubed)
- CHANGE: Upgrade protobufjs, long and mocha dependencies (deyhle)

0.0.6 (30 April 2016)
- FEATURE: deserialize linked events (ZBlocker655)

0.0.5 (16 March 2015)
- FIX: add documentation around subscription interfaces (x-cubed)
- FIX: readme links in the wrong case (x-cubed)

0.0.4 (16 March 2015)
- FEATURE: add script commands for running Mocha (x-cubed)
- FEATURE: improve the README (x-cubed)
- FEATURE: add support for GUIDs with or without braces and dashes (x-cubed)

0.0.3 (11 March 2015)
- FEATURE: check the eventId is in the right format, converting it if necessary (x-cubed)
- FEATURE: add support for parsing BadRequest responses from the server (x-cubed)
- FEATURE: add WriteEvents unit test (x-cubed)

0.0.2 (11 March 2015)
- FEATURE: add some basic unit tests (x-cubed)
- FEATURE: provide sensible defaults for the options (x-cubed)
- FEATURE: add Typescript definitions (x-cubed)
- FEATURE: add support for deleting streams (x-cubed)
- FEATURE: better error handling (x-cubed)
- CHANGE: refactoring to share common code (x-cubed)

0.0.1 (21 August 2014)
- Initial release (x-cubed)
