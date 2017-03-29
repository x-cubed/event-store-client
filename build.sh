#! /bin/bash

set -u

# ensure that eventstore ends when this process does
trap "kill 0" SIGINT

function clean {
	mkdir -p ./build
	rm -rf ./build/*
	mkdir -p ./build/server
}

function setup_server {
	default_download_url="http://download.geteventstore.com/binaries/EventStore-OSS-MacOSX-v3.9.1.tar.gz"
	download_url=${ES_DOWNLOAD_URL:-$default_download_url}

	curl -o ./build/eventstore.tar.gz $download_url 	

	tar -xvf ./build/eventstore.tar.gz -C ./build/server --strip 1
}

function start_server {
	(
		cd ./build/server
		./eventstored -MemDb --run-projections=SYSTEM &> server.out.log &
	)
}

function get_eventstore_status {
	curl -I -X GET -H "Accept:application/vnd.eventstore.atom+json" "http://127.0.0.1:2113/streams/\$stats-127.0.0.1:2113" -u admin:changeit | head -n 1|cut -d$' ' -f2
}

function wait_for_server_to_start {
	local stream_found=false

	for i in {1..10} 
	do 
	 status_code=$(get_eventstore_status)
	 echo "got status code $status_code from server"
	 if [ "$status_code" == "200" ]
	 	then
	 		stream_found=true
	 		echo "server ready"
	 		break  
	 fi
	 sleep 5
	done

	echo $stream_found
	if ! [[ stream_found ]]
		then
			echo "error: could not read from stats stream to conform server is available"
			exit 1
	fi
}

function main {
	clean
	setup_server
	start_server

	wait_for_server_to_start
	
	npm test
	npm_result=$?

	killall eventstored
	exit $npm_result
}

main

