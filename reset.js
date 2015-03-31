var Q = require("kew");
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");

// Get panels that are not empty
var infoPromises = [
	db.search("panels", "value.capacity.taken: (NOT 0)"),
	db.search("sessions", "value.capacity.taken: (NOT 0)")
];
var totalSessions = 0;
var totalUsers = 0;
Q.all(infoPromises)
	.then(function (results) {
		var results1 = results[0].body.results.concat();
		var results2 = results[1].body.results.concat();
		var sessions = results1.concat(results2);
		totalSessions = sessions.length;
		sessions = sessions.map(function (session) {
			return db.newPatchBuilder(session.path.collection, session.path.key)
				.replace("capacity.taken", 0)
				.apply();
		});
		return Q.all(sessions);
	})
	.then(function () {
		// All sessions and panels are now set to 0 taken spots
		return db.search("users", "*");
	})
	.then(function (results) {
		var users = results.body.results;
		totalUsers = users.length;
		users = users.map(function (user) {
			return [
				db.remove("users", user.path.key, true),
				db.put("users", user.path.key, user.value)
			];
		}).reduce(function (a, b) {
			return a.concat(b);
		});
		return Q.all(users);
	})
	.then(function () {
		console.log(`Finished!`);
		console.log(`Reset ${totalSessions} sessions`);
		console.log(`Purged ${totalUsers} users`);
	})
	.fail(function (err) {
		console.error("An error occurred!");
		console.error(err.stack);
	});