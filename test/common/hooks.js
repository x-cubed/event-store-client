const {Docker} = require('node-docker-api');
const fs = require('fs');
const process = require('process');

// Connect to Docker daemon
const socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const isSocket = fs.existsSync(socket) ? fs.statSync(socket).isSocket() : false
const docker = isSocket
  ? new Docker()
  : new Docker({ socketPath: socket })

const imageName = 'eventstore/eventstore';
var container = null;

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

before('Run Docker', async function() {
	// Starting Event Store can take a while, the default 2s timeout is not enough
	this.timeout(0);

	// Start a new Event Store container
	container = await docker.container.create({
		Image: imageName,
		Env: [
			'EVENTSTORE_CERTIFICATE_FILE=/var/lib/eventstore/certs/eventstore.p12', 
			'EVENTSTORE_EXT_SECURE_TCP_PORT=1115',
			'MEM_DB=1',
		],
		ExposedPorts: {
			"1115/tcp": { }
		},
		HostConfig: {
			Binds: [
				`${__dirname}:/var/lib/eventstore/certs`
			],
			PortBindings: {
				"1113/tcp": [
					{ HostPort: "1113" }
				],
				"1115/tcp": [
					{ HostPort: "1115" }
				],
				"2113/tcp": [
					{ HostPort: "2113" }
				]
			}
		}
	});
	container.start();
	console.log('Started container with ID: ', container.id);

	// Wait for Event Store to startup and respond to health checks
	var health = null;
	do {
		var containerStatus = await container.status();
		var containerHealth = containerStatus.data.State.Health;
		if (containerHealth) {
			var newHealth = containerHealth.Status;
			if (newHealth != health) {
				health = newHealth;
				console.log('Container status: ', health);
			} else {
				await sleep(100);
			}
		} else {
			await sleep(100);
		}
	} while (health != 'healthy');
});

after('Stop Docker', async function() {
	this.timeout(0);
	
	console.log('Stopping container...');
	await container.stop();
	await container.delete({ force: true }).catch(err => console.error(err));
	console.log('Stopped container with ID: ', container.id);
});
