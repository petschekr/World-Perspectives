"use strict";
var crypto = require("crypto");
var fs = require("fs");

var moment = require("moment");
var Promise = require("bluebird");
fs = Promise.promisifyAll(fs);
var Q = require("kew"); // Because the Orchesrate driver for Node.js forces its use
// Initialize the database connection
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");

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
app.use(cookieParser(
	"2ecdd4ffeacce64fa760f0be9cdfc7f9422eb8048564e5c2779167be66a19819", // Secret for signing cookies
	{
		"path": "/",
		"maxAge": 60 * 24 * 30 * 6, // 6 months
		"secure": false, // Set this to true when you get a domain + SSL cert
		"httpOnly": true
	}
));
app.use("/bower_components", serveStatic("bower_components"));
app.use("/components", serveStatic("components"));
app.use("/css", serveStatic("css"));
app.use("/img", serveStatic("img"));

// Set up the Socket.io server
var io = require("socket.io")(server);

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
			response.send({
				"error": "Missing attendee ID or session ID"
			});
			return;
		}
		
		function CancelError (message) {
			this.message = message;
		}
		CancelError.prototype = Object.create(Error.prototype);

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
					deregistrationPromises.push(db.newGraphBuilder()
						.remove()
						.from("users", userID)
						.related("attendee")
						.to("panels", previousSession.path.key));
					deregistrationPromises.push(db.newGraphBuilder()
						.remove()
						.from("panels", previousSession.path.key)
						.related("attendee")
						.to("users", userID));
					return Q.all(deregistrationPromises).then(function () {
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
					"session": sessionID,
					"taken": sessionInfo.capacity.taken + 1
				});
				// Proceed with registration for this spot (create a bidirectional relationship)
				var graphPromises = [];
				graphPromises.push(db.newGraphBuilder()
					.create()
					.from("panels", sessionKey)
					.related("attendee")
					.to("users", attendeeKey));
				graphPromises.push(db.newGraphBuilder()
					.create()
					.from("users", attendeeKey)
					.related("attendee")
					.to("panels", sessionKey));
				return Q.all(graphPromises);
			})
			.then(function () {
				response.json({
					"success": true
				});
			})
			.fail(function (err) {
				if (err instanceof CancelError) {
					response.json({
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
app.route("/sessions/wpp").get(function (request, response) {
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
});
app.route("/sessions/science").get(function (request, response) {
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