/*jslint node: true */
/*jslint esnext: true */
"use strict";
var Q = require("kew");
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");
var moment = require("moment");
var urllib = require("url");

function graphReaderGetAll (collection, key, relation) {
	var allResults = [];

	function promiseWhile (condition, body) {
		var done = Q.defer();
		function loop() {
			if (!condition())
				return done.resolve(allResults);
			body().then(loop).fail(done.reject);
		}
		Q.fcall(loop);
		return done.promise;
	}

	return db.newGraphReader()
		.get()
		.limit(100)
		.from(collection, key)
		.related(relation)
		.then(function (results) {
			allResults = allResults.concat(results.body.results);
			var currentResults = results;
			return promiseWhile(
				function () {
					return !!currentResults.body.next;
				},
				function () {
					var offset = parseInt(urllib.parse(currentResults.body.next, true).query.offset, 10);
					return db.newGraphReader()
						.get()
						.limit(100)
						.offset(offset)
						.from(collection, key)
						.related(relation)
						.then(function (newResults) {
							allResults = allResults.concat(newResults.body.results);
							currentResults = newResults;
							return Q.resolve();
						});
				}
			);
		});
}
function searchGetAll (collection, search) {
	var allResults = [];

	function promiseWhile (condition, body) {
		var done = Q.defer();
		function loop() {
			if (!condition()) {
				return done.resolve(allResults);
			}
			body().then(loop).fail(done.reject);
		}
		Q.fcall(loop);
		return done.promise;
	}

	return db.newSearchBuilder()
		.collection(collection)
		.limit(100)
		.query(search)
		.then(function (results) {
			allResults = allResults.concat(results.body.results);
			var currentResults = results;
			return promiseWhile(
				function () {
					return currentResults.links && currentResults.links.next;
				},
				function () {
					return currentResults.links.next.get().then(function (newResults) {
						allResults = allResults.concat(newResults.body.results);
						currentResults = newResults;
						return Q.resolve();
					});
				}
			);
		});
}
var panels = [];
var sessions = [];

function updateAll() {
	// Filter out full sessions
	panels.forEach(function (panel, index) {
		if (panel.attendees.length >= panel.capacity.total) {
			panels.splice(index, 1);
			return;
		}
		panels[index].capacity.taken = panel.attendees.length;
	});
	sessions.forEach(function (session, index) {
		if (session.attendees.length >= session.capacity.total) {
			sessions.splice(index, 1);
			return;
		}
		sessions[index].capacity.taken = session.attendees.length;
	});
	// Sort panels and sessions based on how many spots are remaining
	function sortByRemaining(a, b) {
		var aRemaining = a.capacity.total - a.capacity.taken;
		var bRemaining = b.capacity.total - b.capacity.taken;
		return bRemaining - aRemaining;
	}
	panels = panels.sort(sortByRemaining);
	sessions = sessions.sort(sortByRemaining);
}

Q.all([searchGetAll("panels", "*"), searchGetAll("sessions", "*")])
	.then(function (results) {
		panels = results[0];
		sessions = results[1];

		var panelsPromises = panels.map(function (panel) {
			return graphReaderGetAll("panels", panel.path.key, "attendee");
		});
		var sessionsPromises = sessions.map(function (session) {
			return graphReaderGetAll("sessions", session.path.key, "attendee");
		});
		panels = panels.map(function (panel) {
			var toReturn = panel.value;
			toReturn.id = panel.path.key;
			return toReturn;
		});
		sessions = sessions.map(function (session) {
			var toReturn = session.value;
			toReturn.id = session.path.key;
			return toReturn;
		});

		return Q.all([Q.all(panelsPromises), Q.all(sessionsPromises)]);
	})
	.then(function (results) {
		results[0].forEach(function (panelResult, index) {
			panels[index].attendees = panelResult.map(function (result) {
				return {
					"name": result.value.name,
					"username": result.path.key,
					"faculty": !!result.value.faculty
				};
			});
		});
		results[1].forEach(function (sessionResult, index) {
			sessions[index].attendees = sessionResult.map(function (result) {
				return {
					"name": result.value.name,
					"username": result.path.key,
					"faculty": !!result.value.faculty
				};
			});
		});
		updateAll();
		return searchGetAll("users", "*");
	})
	.then(function (allPeople) {
		allPeople = allPeople.map(function (person) {
			return db.newGraphReader()
				.get()
				.from("users", person.path.key)
				.related("attendee")
				.then(function (results) {
					results = results.body.results;
					if (results.length < 5) {
						[
							1429707600000, // 9:00 AM - first session
							1429710900000, // 9:55 AM - second session
							1429716600000, // 11:30 AM - third session
							1429719900000, // 12:25 PM - fourth session
							1429723200000  // 1:20 PM - fifth session
						].forEach(function (time) {
							var searchTime = moment(new Date(time)).utc().format("ddd MMM DD YYYY HH:mm:ss [GMT+00:00]"); // Formatted like the UTC string respresentation in the database
							for (let i = 0; i < results.length; i++) {
								if (new Date(results[i].value.time.start).valueOf() === time) {
									console.log("Skipped " + person.value.name);
									return;
								}
							}
							// Is not already placed in a session for this time period
							var currentPanels = panels.map(function (panel) {
							 	if (new Date(panel.time.start).valueOf() === time) {
									return panel;
								}
								else {
									return undefined;
								}
							});
							var currentSessions = sessions.map(function (session) {
							 	if (new Date(session.time.start).valueOf() === time) {
									return session;
								}
								else {
									return undefined;
								}
							});
							for (let i = 0; i < currentSessions.length; i++) {
								if (!currentSessions[i]) {
									continue;
								}
								console.log(`${person.value.name} placed in ${currentSessions[i].name}`);
								sessions[i].attendees.push({
									"name": person.value.name,
									"username": person.path.key,
									"faculty": !!person.value.faculty
								});
								updateAll();
								return Q.all([
									db.newGraphBuilder()
										.create()
										.from("sessions", currentSessions[i].id)
										.related("attendee")
										.to("users", person.path.key),
									db.newGraphBuilder()
										.create()
										.from("users", person.path.key)
										.related("attendee")
										.to("sessions", currentSessions[i].id)
								]);
							}
							for (let i = 0; i < currentPanels.length; i++) {
								if (!currentPanels[i]) {
									continue;
								}
								console.log(`${person.value.name} placed in ${currentPanels[i].name}`);
								panels[i].attendees.push({
									"name": person.value.name,
									"username": person.path.key,
									"faculty": !!person.value.faculty
								});
								updateAll();
								return Q.all([
									db.newGraphBuilder()
										.create()
										.from("panels", currentPanels[i].id)
										.related("attendee")
										.to("users", person.path.key),
									db.newGraphBuilder()
										.create()
										.from("users", person.path.key)
										.related("attendee")
										.to("panels", currentPanels[i].id)
								]);
							}
							console.log(`${person.value.name} couldn't be placed at ${time.toString()} because there aren't any open sessions`);
						});
					}
					// Done drawing graph connections; mark as registered
					return db.newPatchBuilder("users", person.path.key)
						.add("registered", true)
						.apply();
				});
		});
		return Q.all(allPeople);
	})
	.then(function () {
		console.log("Finished registering users");
		var updatePromises = [];
		panels.forEach(function (panel) {
			console.log(`Updating ${panel.id} to ${panel.attendees.length} attendees`);
			updatePromises.push(
				db.newPatchBuilder("panels", panel.id)
					.replace("capacity.taken", panel.attendees.length)
					.apply()
			);
		});
		sessions.forEach(function (session) {
			updatePromises.push(
				db.newPatchBuilder("sessions", session.id)
					.replace("capacity.taken", session.attendees.length)
					.apply()
			);
		});
		console.log("Update promises:", updatePromises.length);
		return Q.all(updatePromises);
	})
	.then(function () {
		console.log("Finished!");
	})
	.fail(function (err) {
		console.error("An error occurred:");
		console.error(err.stack);
	});
