"use strict";
var crypto = require("crypto");
var fs = require("fs");

var moment = require("moment");
var Promise = require("bluebird");
fs = Promise.promisifyAll(fs);
var Q = require("kew"); // Because the Orchestrate driver for Node.js forces its use
// Initialize the database connection
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");
db.ping()
	.then(function () {
		console.log("Successfully connected to Orchestrate");
	})
	.fail(function () {
		console.error("Failed to connect to Orchestrate");
	});

// Set up the Express server
var express = require("express");
var serveStatic = require("serve-static");
var responseTime = require("response-time");
var compress = require("compression");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");

var app = express();
var server = require("http").Server(app)
var postParser = bodyParser.urlencoded({"extended": false});

app.use(compress());
app.use(responseTime());
var cookieOptions = {
	"path": "/",
	"maxAge": 1000 * 60 * 60 * 24 * 30 * 6, // 6 months
	"secure": false, // Set this to true when you get a domain + SSL cert
	"httpOnly": true,
	"signed": true
};
app.use(cookieParser(
	"2ecdd4ffeacce64fa760f0be9cdfc7f9422eb8048564e5c2779167be66a19819", // Secret for signing cookies
	cookieOptions
));
app.use("/bower_components", serveStatic("bower_components"));
app.use("/components", serveStatic("components"));
app.use("/css", serveStatic("css"));
app.use("/img", serveStatic("img"));

// Set up the Socket.io server
var io = require("socket.io")(server);

function CancelError (message) {
	this.message = message;
}
CancelError.prototype = Object.create(Error.prototype);

app.route("/register").get(function (request, response) {
	fs.readFileAsync("invalidcode.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/register/:code").get(function (request, response) {
	var code = request.params.code.toString();
	// Check if the provided code is valid
	db.search("users", `value.code: "${code}"`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.redirect("/register");
				return;
			}
			var user = results[0].value;
			var username = results[0].path.key;
			// Set a cookie to identify this user later
			if (request.signedCookies.username !== username) {
				response.cookie("username", username, cookieOptions);
			}

			fs.readFileAsync("register.html", {"encoding": "utf8"})
				.then(function (html) {
					response.send(html);
				})
		});
});
// AJAX endpoints
app.route("/info/:code").get(function (request, response) {
	var code = request.params.code.toString();
	db.search("users", `value.code: "${code}"`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(404).json({
					"error": "No user with that registration code exists"
				});
				return;
			}
			var result = results[0];
			response.json({
				"code": result.value.code,
				"name": result.value.name,
				"username": result.path.key
			});	
		});
});
app.route("/sessions/panels")
	.get(function (request, response) {
		db.newSearchBuilder()
			.collection("panels")
			.limit(100)
			.sort("name", "asc")
			.query("*")
			.then(function (results) {
				results = results.body.results;
				var panels = results.map(function (panelResponse) {
					var panelObject = panelResponse.value;
					panelObject.id = panelResponse.path.key;
					return panelObject;
				});
				response.send(panels);
			});
	})
	.post(postParser, function (request, response) {
		// Register the user for their selected first choice
		var userID = request.body.attendee.toString();
		var sessionID = request.body.session.toString();
		if (!userID || !sessionID) {
			response.status(400).send({
				"error": "Missing attendee ID or session ID"
			});
			return;
		}

		var sessionKey = sessionID;
		var attendeeKey = userID;
		var sessionInfo = undefined;

		// Deregister the previous session (if it exists)
		// At this stage, only first choices for each type will have been selected
		db.newGraphReader()
			.get()
			.from("users", userID)
			.related("attendee")
			.then(function (results) {
				if (results.body.count > 3) {
					return Q.reject(new CancelError("Can't edit choices at this stage."));
				}
				results = results.body.results;
				var previousSession = undefined;
				for (var i = 0; i < results.length; i++) {
					if (results[i].path.collection === "panels") {
						previousSession = results[i];
					}
				}
				if (previousSession) {
					// Deregister
					var deregistrationPromises = [];
					deregistrationPromises.push(
						db.newGraphBuilder()
							.remove()
							.from("users", userID)
							.related("attendee")
							.to("panels", previousSession.path.key)
					);
					deregistrationPromises.push(
						db.newGraphBuilder()
							.remove()
							.from("panels", previousSession.path.key)
							.related("attendee")
							.to("users", userID)
					);
					deregistrationPromises.push(
						db.newPatchBuilder("panels", previousSession.path.key)
							.inc("capacity.taken", -1)
							.apply()
					);
					return Q.all(deregistrationPromises)
						.then(function () {
							return db.newGraphReader()
								.get()
								.from("panels", previousSession.path.key)
								.related("attendee");
						})
						.then(function (results) {
							var currentAttendees = results.body.total_count || results.body.count;
							io.emit("availability", {
								"type": "panel",
								"session": previousSession.path.key,
								"taken": currentAttendees
							});
							return db.search("users", `@path.key: ${attendeeKey}`);
						});
				}
				else {
					return db.search("users", `@path.key: ${attendeeKey}`);
				}
			})
			.then(function (results) {
				results = results.body.results;
				if (results.length !== 1) {
					return Q.reject(new CancelError("Invalid attendee ID."));
				}
				attendeeKey = results[0].path.key;
				return db.search("panels", `@path.key: ${sessionKey}`)
			})
			.then(function (results) {
				results = results.body.results;
				if (results.length !== 1) {
					return Q.reject(new CancelError("Invalid session ID."));
				}
				sessionInfo = results[0].value;
				sessionInfo.id = results[0].path.key;
				return db.newGraphReader()
					.get()
					.from("panels", sessionKey)
					.related("attendee");
			})
			.then(function (results) {
				var currentAttendees = results.body.total_count || results.body.count;
				if (currentAttendees >= sessionInfo.capacity.total) {
					return Q.reject(new CancelError("There are too many people in that panel. Please choose another."));
				}
				// Broadcast the new number of attendees
				io.emit("availability", {
					"type": "panel",
					"session": sessionID,
					"taken": sessionInfo.capacity.taken + 1
				});
				// Proceed with registration for this spot (create a bidirectional relationship)
				var registrationPromises = [];
				registrationPromises.push(
					db.newGraphBuilder()
						.create()
						.from("panels", sessionKey)
						.related("attendee")
						.to("users", attendeeKey)
				);
				registrationPromises.push(
					db.newGraphBuilder()
						.create()
						.from("users", attendeeKey)
						.related("attendee")
						.to("panels", sessionKey)
				);
				registrationPromises.push(
					db.newPatchBuilder("panels", sessionKey)
						.inc("capacity.taken", 1)
						.apply()
				);
				return Q.all(registrationPromises);
			})
			.then(function () {
				response.json({
					"success": true
				});
			})
			.fail(function (err) {
				if (err instanceof CancelError) {
					response.status(400).json({
						"error": err.message
					});
				}
				else {
					console.error(err);
					response.status(500).json({
						"error": "An internal server error occurred."
					});
				}
			});
	});
app.route("/sessions/wpp")
	.get(function (request, response) {
		db.newSearchBuilder()
			.collection("sessions")
			.limit(100)
			.sort("name", "asc")
			.query('value.type: "wpp"')
			.then(function (results) {
				results = results.body.results;
				var sessions = results.map(function (sessionResponse) {
					var sessionObject = sessionResponse.value;
					sessionObject.id = sessionResponse.path.key;
					return sessionObject;
				});
				response.send(sessions);
			})
	})
	.post(postParser, function (request, response) {
		// Register the user for their selected first choice
		var userID = request.body.attendee.toString();
		var sessionID = request.body.session.toString();
		if (!userID || !sessionID) {
			response.status(400).send({
				"error": "Missing attendee ID or session ID"
			});
			return;
		}

		var sessionKey = sessionID;
		var attendeeKey = userID;
		var sessionInfo = undefined;

		// Deregister the previous session (if it exists)
		// At this stage, only first choices for each type will have been selected
		db.newGraphReader()
			.get()
			.from("users", userID)
			.related("attendee")
			.then(function (results) {
				if (results.body.count > 3) {
					return Q.reject(new CancelError("Can't edit choices at this stage."));
				}
				results = results.body.results;
				var previousSession = undefined;
				for (var i = 0; i < results.length; i++) {
					if (results[i].value.type === "wpp") {
						previousSession = results[i];
					}
				}
				if (previousSession) {
					// Deregister
					var deregistrationPromises = [];
					deregistrationPromises.push(
							db.newGraphBuilder()
								.remove()
								.from("users", userID)
								.related("attendee")
								.to("sessions", previousSession.path.key)
						);
					deregistrationPromises.push(
						db.newGraphBuilder()
							.remove()
							.from("sessions", previousSession.path.key)
							.related("attendee")
							.to("users", userID)
					);
					deregistrationPromises.push(
						db.newPatchBuilder("sessions", previousSession.path.key)
							.inc("capacity.taken", -1)
							.apply()
					);
					return Q.all(deregistrationPromises)
						.then(function () {
							return db.newGraphReader()
								.get()
								.from("sessions", previousSession.path.key)
								.related("attendee");
						})
						.then(function (results) {
							var currentAttendees = results.body.total_count || results.body.count;
							io.emit("availability", {
								"type": "wpp",
								"session": previousSession.path.key,
								"taken": currentAttendees
							});
							return db.search("users", `@path.key: ${attendeeKey}`);
						});
				}
				else {
					return db.search("users", `@path.key: ${attendeeKey}`);
				}
			})
			.then(function (results) {
				results = results.body.results;
				if (results.length !== 1) {
					return Q.reject(new CancelError("Invalid attendee ID."));
				}
				attendeeKey = results[0].path.key;
				return db.search("sessions", `@path.key: ${sessionKey}`)
			})
			.then(function (results) {
				results = results.body.results;
				if (results.length !== 1) {
					return Q.reject(new CancelError("Invalid session ID."));
				}
				sessionInfo = results[0].value;
				sessionInfo.id = results[0].path.key;
				return db.newGraphReader()
					.get()
					.from("sessions", sessionKey)
					.related("attendee");
			})
			.then(function (results) {
				var currentAttendees = results.body.total_count || results.body.count;
				if (currentAttendees >= sessionInfo.capacity.total) {
					return Q.reject(new CancelError("There are too many people in that session. Please choose another."));
				}
				// Broadcast the new number of attendees
				io.emit("availability", {
					"type": "wpp",
					"session": sessionID,
					"taken": sessionInfo.capacity.taken + 1
				});
				// Proceed with registration for this spot (create a bidirectional relationship)
				var registrationPromises = [];
				registrationPromises.push(
					db.newGraphBuilder()
						.create()
						.from("sessions", sessionKey)
						.related("attendee")
						.to("users", attendeeKey)
				);
				registrationPromises.push(
					db.newGraphBuilder()
						.create()
						.from("users", attendeeKey)
						.related("attendee")
						.to("sessions", sessionKey)
				);
				registrationPromises.push(
					db.newPatchBuilder("sessions", sessionKey)
						.inc("capacity.taken", 1)
						.apply()
				);
				return Q.all(registrationPromises);
			})
			.then(function () {
				response.json({
					"success": true
				});
			})
			.fail(function (err) {
				if (err instanceof CancelError) {
					response.status(400).json({
						"error": err.message
					});
				}
				else {
					console.error(err);
					response.status(500).json({
						"error": "An internal server error occurred."
					});
				}
			});
	});
app.route("/sessions/science")
	.get(function (request, response) {
		db.newSearchBuilder()
			.collection("sessions")
			.limit(100)
			.sort("name", "asc")
			.query('value.type: "science"')
			.then(function (results) {
				results = results.body.results;
				var sessions = results.map(function (sessionResponse) {
					var sessionObject = sessionResponse.value;
					sessionObject.id = sessionResponse.path.key;
					return sessionObject;
				});
				response.send(sessions);
			})
	})
	.post(postParser, function (request, response) {
		// Register the user for their selected first choice
		var userID = request.body.attendee.toString();
		var sessionID = request.body.session.toString();
		if (!userID || !sessionID) {
			response.status(400).send({
				"error": "Missing attendee ID or session ID"
			});
			return;
		}

		var sessionKey = sessionID;
		var attendeeKey = userID;
		var sessionInfo = undefined;

		// Deregister the previous session (if it exists)
		// At this stage, only first choices for each type will have been selected
		db.newGraphReader()
			.get()
			.from("users", userID)
			.related("attendee")
			.then(function (results) {
				if (results.body.count > 3) {
					return Q.reject(new CancelError("Can't edit choices at this stage."));
				}
				results = results.body.results;
				var previousSession = undefined;
				for (var i = 0; i < results.length; i++) {
					if (results[i].value.type === "science") {
						previousSession = results[i];
					}
				}
				if (previousSession) {
					// Deregister
					var deregistrationPromises = [];
					deregistrationPromises.push(
						db.newGraphBuilder()
							.remove()
							.from("users", userID)
							.related("attendee")
							.to("sessions", previousSession.path.key)
					);
					deregistrationPromises.push(
						db.newGraphBuilder()
							.remove()
							.from("sessions", previousSession.path.key)
							.related("attendee")
							.to("users", userID)
					);
					deregistrationPromises.push(
						db.newPatchBuilder("sessions", previousSession.path.key)
							.inc("capacity.taken", -1)
							.apply()
					);
					return Q.all(deregistrationPromises)
						.then(function () {
							return db.newGraphReader()
								.get()
								.from("sessions", previousSession.path.key)
								.related("attendee");
						})
						.then(function (results) {
							var currentAttendees = results.body.total_count || results.body.count;
							io.emit("availability", {
								"type": "science",
								"session": previousSession.path.key,
								"taken": currentAttendees
							});
							return db.search("users", `@path.key: ${attendeeKey}`);
						});
				}
				else {
					return db.search("users", `@path.key: ${attendeeKey}`);
				}
			})
			.then(function (results) {
				results = results.body.results;
				if (results.length !== 1) {
					return Q.reject(new CancelError("Invalid attendee ID."));
				}
				attendeeKey = results[0].path.key;
				return db.search("sessions", `@path.key: ${sessionKey}`)
			})
			.then(function (results) {
				results = results.body.results;
				if (results.length !== 1) {
					return Q.reject(new CancelError("Invalid session ID."));
				}
				sessionInfo = results[0].value;
				sessionInfo.id = results[0].path.key;
				return db.newGraphReader()
					.get()
					.from("sessions", sessionKey)
					.related("attendee");
			})
			.then(function (results) {
				var currentAttendees = results.body.total_count || results.body.count;
				if (currentAttendees >= sessionInfo.capacity.total) {
					return Q.reject(new CancelError("There are too many people in that session. Please choose another."));
				}
				// Broadcast the new number of attendees
				io.emit("availability", {
					"type": "science",
					"session": sessionID,
					"taken": sessionInfo.capacity.taken + 1
				});
				// Proceed with registration for this spot (create a bidirectional relationship)
				var registrationPromises = [];
				registrationPromises.push(
					db.newGraphBuilder()
						.create()
						.from("sessions", sessionKey)
						.related("attendee")
						.to("users", attendeeKey)
				);
				registrationPromises.push(
					db.newGraphBuilder()
						.create()
						.from("users", attendeeKey)
						.related("attendee")
						.to("sessions", sessionKey)
				);
				registrationPromises.push(
					db.newPatchBuilder("sessions", sessionKey)
						.inc("capacity.taken", 1)
						.apply()
				);
				return Q.all(registrationPromises);
			})
			.then(function () {
				response.json({
					"success": true
				});
			})
			.fail(function (err) {
				if (err instanceof CancelError) {
					response.status(400).json({
						"error": err.message
					});
				}
				else {
					console.error(err);
					response.status(500).json({
						"error": "An internal server error occurred."
					});
				}
			});
	});
app.route("/sessions/remaining/1").get(function (request, response) {
	var username = request.signedCookies.username;
	if (!username) {
		response.status(400).send({
			"error": "Missing identification cookie"
		});
		return;
	}
	db.search("users", `@path.key: ${username}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid identification cookie."));
			}
			return db.newGraphReader()
				.get()
				.from("users", username)
				.related("attendee");
		})
		.then(function (results) {
			if (results.body.count !== 3) {
				return Q.reject(new CancelError("More or fewer than 3 sessions chosen already."));
			}
			results = results.body.results;
			//moment(date).utc().format("ddd MMM DD YYYY HH:mm:ss [GMT+00:00]")
			var availableStartTimes = [
				1429707600000, // 9:00 AM - first session
				1429710900000, // 9:55 AM - second session
				1429716600000, // 11:30 AM - third session
				1429719900000, // 12:25 PM - fourth session
				1429723200000 // 1:20 PM - fifth session
			];
			for (var i = 0; i < results.length; i++) {
				availableStartTimes.splice(new Date(results[i].value.time.start).valueOf(), 1);
			}
			// availableStartTimes will now only contain two times that are available
			var findTime;
			availableStartTimes[0] = moment(availableStartTimes[0]);
			availableStartTimes[1] = moment(availableStartTimes[1]);

			if (availableStartTimes[0].isBefore(availableStartTimes[1])) {
				findTime = availableStartTimes[0];
			}
			else {
				findTime = availableStartTimes[1];
			}
			findTime = findTime.utc().format("ddd MMM DD YYYY HH:mm:ss [GMT+00:00]"); // Formatted like the UTC string respresentation in the database

			var searchPromises = [];
			searchPromises.push(
				db.search("panels", `value.time.start: "${findTime}"`)
			);
			searchPromises.push(
				db.newSearchBuilder()
					.collection("sessions")
					.sort("type", "asc")
					.query(`value.time.start: "${findTime}"`)
			);
			return Q.all(searchPromises);
		})
		.then(function (results) {
			var availableSessions = results[0].body.results;
			availableSessions.concat(results[1].body.results);
			availableSessions = availableSessions.map(function (session) {
				var sessionObject = session.value;
				sessionObject.id = session.path.key;
				return sessionObject;
			});
			var startFormat = moment(new Date(availableSessions[0].time.start)).format("h:mm A");
			var endFormat = moment(new Date(availableSessions[0].time.end)).format("h:mm A");
			response.json({
				"start": startFormat,
				"end": endFormat,
				"sessions": availableSessions
			});
		})
		.fail(function (err) {
			if (err instanceof CancelError) {
				response.status(400).json({
					"error": err.message
				});
			}
			else {
				console.error(err);
				response.status(500).json({
					"error": "An internal server error occurred."
				});
			}
		});
});
app.route("/sessions/remaining/2").get(function (request, response) {
	var username = request.signedCookies.username;
	if (!username) {
		response.status(400).send({
			"error": "Missing identification cookie"
		});
		return;
	}
	db.search("users", `@path.key: ${username}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid identification cookie."));
			}
			return db.newGraphReader()
				.get()
				.from("users", username)
				.related("attendee");
		})
		.then(function (results) {
			if (results.body.count !== 4) {
				return Q.reject(new CancelError("More or fewer than 4 sessions chosen already."));
			}
			results = results.body.results;
			//moment(date).utc().format("ddd MMM DD YYYY HH:mm:ss [GMT+00:00]")
			var availableStartTimes = [
				1429707600000, // 9:00 AM - first session
				1429710900000, // 9:55 AM - second session
				1429716600000, // 11:30 AM - third session
				1429719900000, // 12:25 PM - fourth session
				1429723200000 // 1:20 PM - fifth session
			];
			for (var i = 0; i < results.length; i++) {
				availableStartTimes.splice(new Date(results[i].value.time.start).valueOf(), 1);
			}
			// availableStartTimes will now only contain time that is available
			var findTime = availableStartTimes[0].utc().format("ddd MMM DD YYYY HH:mm:ss [GMT+00:00]"); // Formatted like the UTC string respresentation in the database

			var searchPromises = [];
			searchPromises.push(
				db.search("panels", `value.time.start: "${findTime}"`)
			);
			searchPromises.push(
				db.newSearchBuilder()
					.collection("sessions")
					.sort("type", "asc")
					.query(`value.time.start: "${findTime}"`)
			);
			return Q.all(searchPromises);
		})
		.then(function (results) {
			var availableSessions = results[0].body.results;
			availableSessions.concat(results[1].body.results);
			availableSessions = availableSessions.map(function (session) {
				var sessionObject = session.value;
				sessionObject.id = session.path.key;
				return sessionObject;
			});
			var startFormat = moment(new Date(availableSessions[0].time.start)).format("h:mm A");
			var endFormat = moment(new Date(availableSessions[0].time.end)).format("h:mm A");
			response.json({
				"start": startFormat,
				"end": endFormat,
				"sessions": availableSessions
			});
		})
		.fail(function (err) {
			if (err instanceof CancelError) {
				response.status(400).json({
					"error": err.message
				});
			}
			else {
				console.error(err);
				response.status(500).json({
					"error": "An internal server error occurred."
				});
			}
		});
});

// 404 page
app.use(function (request, response, next) {
	response.status(404).send("404 Not found!");
});
// Error handling
app.use(function (err, request, response, next) {
	console.error(err);
	response.status(500);
	response.send("An error occurred!");
});

// Socket.io stuff
io.on("connection", function (socket) {
	// socket.emit("availability", {});
	// socket.on("event", function (data) {
	// 	console.log(data);
	// });
});

var PORT = 80;
server.listen(PORT, "0.0.0.0", function () {
	console.log("Server listening on port " + PORT);
});