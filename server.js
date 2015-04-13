/*jslint node: true */
/*jslint esnext: true */
"use strict";
var crypto = require("crypto");
var fs = require("fs");
var http = require("http");
var https = require("https");
var urllib = require("url");

var moment = require("moment");
var BPromise = require("bluebird");
fs = BPromise.promisifyAll(fs);
var Q = require("kew"); // Because the Orchestrate driver for Node.js forces its use
// Initialize the database connection
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");
db.ping()
	.then(function () {
		console.log("Successfully connected to Orchestrate");
	})
	.fail(function () {
		console.error("Failed to connect to Orchestrate");
		process.exit(1);
	});
var pusher = new (require("pushbullet"))("gxCTjdJQa7PMjNUFGY3j5ITVWDQ9xvNQ");

// Set up the Express server
var express = require("express");
var serveStatic = require("serve-static");
var responseTime = require("response-time");
var compress = require("compression");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var hsts = require("hsts");

var app = express();
var postParser = bodyParser.urlencoded({"extended": false});

app.use(compress());
app.use(responseTime());
app.use(hsts({
	"maxAge": 1000 * 60 * 60 * 24 * 30 * 6 // 6 months
}));
app.use(function (request, response, next) {
	if (request.secure) {
		next();
	}
	else {
		// Redirect to HTTPS
		response.redirect(301, urllib.resolve("https://wppsymposium.org", request.url));
	}
});
// HTTPS redirect
var cookieOptions = {
	"path": "/",
	"maxAge": 1000 * 60 * 60 * 24 * 30 * 6, // 6 months
	"secure": true,
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

function CancelError (message) {
	this.message = message;
}
CancelError.prototype = Object.create(Error.prototype);
function handleError (error) {
	console.error(error.stack);
	// Notify via PushBullet
	pusher.note({}, "WPP Error", `${new Date().toString()}\n\n${error.stack}`, function() {});
}

app.route("/login/:code").get(function (request, response) {
	response.clearCookie("username");
	var code = request.params.code.toString();
	// Check if the provided code is valid
	db.search("users", `value.code: "${code}"`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				// Invalid code
				fs.readFileAsync("invalidcode.html", {"encoding": "utf8"})
					.then(function (html) {
						response.send(html);
					});
				return;
			}
			var user = results[0].value;
			var username = results[0].path.key;
			// Set a cookie to identify this user later
			if (request.signedCookies.username !== username) {
				response.cookie("username", username, cookieOptions);
			}
			// Direct request by whether the user has already registered
			if (user.registered) {
				response.redirect("/");
			}
			else {
				response.redirect("/register");
			}
		});
});
app.route("/").get(function (request, response) {
	fs.readFileAsync("index.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/about").get(function (request, response) {
	fs.readFileAsync("about.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/register").get(function (request, response) {
	var userID = request.signedCookies.username;
	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.redirect("/");
				return;
			}
			// Reject request if already registered
			if (results[0].value.registered) {
				fs.readFileAsync("alreadyregistered.html", {"encoding": "utf8"})
					.then(function (html) {
						response.send(html);
					});
			}
			else {
				fs.readFileAsync("register.html", {"encoding": "utf8"})
					.then(function (html) {
						response.send(html);
					});
			}
		});
});
app.route("/schedule/print").get(function (request, response) {
	fs.readFileAsync("schedule.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});

// AJAX endpoints
app.route("/info").get(function (request, response) {
	var userID = request.signedCookies.username;
	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Invalid identification cookie"
				});
				return;
			}
			var result = results[0];
			response.json({
				"code": result.value.code,
				"name": result.value.name,
				"username": result.path.key,
				"admin": !!result.value.admin
			});
		});
});
app.route("/schedule").get(function (request, response) {
	var userID = request.signedCookies.username;
	var user = null;
	var scheduleResponse = [
		{"time": "8:00 AM – 8:10 AM", "title": "Advisory"},
		{"time": "8:15 AM – 8:55 AM", "title": "Opening Assembly", "location": "Bedford Gym"},
		{"time": "9:00 AM – 9:50 AM", "title": "Session 1", "location": "", "people": []}, // index 2
		{"time": "9:55 AM – 10:45 AM", "title": "Session 2", "location": "", "people": []}, // index 3
		{"time": "10:50 AM – 11:25 AM", "title": "Lunch"},
		{"time": "11:30 AM – 12:20 PM", "title": "Session 3", "location": "", "people": []}, // index 5
		{"time": "12:25 PM – 1:15 PM", "title": "Session 4", "location": "", "people": []}, // index 6
		{"time": "1:20 PM – 2:10 PM", "title": "Session 5", "location": "", "people": []}, // index 7
		{"time": "2:15 PM – 2:40 PM", "title": "Advisory"}
	];
	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Invalid identification cookie",
					"data": scheduleResponse
				});
				return Q.reject(new CancelError("handled"));
			}
			user = results[0];
			if (!user.value.registered) {
				response.json({
					"registered": false,
					"data": scheduleResponse
				});
				return Q.reject(new CancelError("handled"));
			}
			return db.newGraphReader()
				.get()
				.from("users", userID)
				.related("attendee");
		})
		.then(function (results) {
			results = results.body.results;

			results.forEach(function (session) {
				session = session.value;
				var sessionType;
				if (!session.type) {
					sessionType = "Panel";
				}
				else {
					if (session.type === "wpp") {
						sessionType = "Global";
					}
					else if (session.type === "science") {
						sessionType = "Science";
					}
				}
				var unixTimeStart = new Date(session.time.start).valueOf();
				switch (unixTimeStart) {
					case 1429707600000: // 9:00 AM - first session
						applyToSchedule(2);
						break;
					case 1429710900000: // 9:55 AM - second session
						applyToSchedule(3);
						break;
					case 1429716600000: // 11:30 AM - third session
						applyToSchedule(5);
						break;
					case 1429719900000: // 12:25 PM - fourth session
						applyToSchedule(6);
						break;
					case 1429723200000: // 1:20 PM - fifth session
						applyToSchedule(7);
						break;
				}
				function applyToSchedule (index) {
					scheduleResponse[index].title = session.name + ` (${sessionType})`;
					scheduleResponse[index].location = session.location;
					scheduleResponse[index].people = (sessionType === "Panel") ? session.panelists.join(", ") : session.presenter;
				}
			});

			response.json({
				"registered": true,
				"data": scheduleResponse
			});
		})
		.fail(function (err) {
			if (err instanceof CancelError) {
				if (err.message !== "handled") {
					response.status(400).json({
						"error": err.message
					});
				}
			}
			else {
				handleError(err);
				response.status(500).json({
					"error": "An internal server error occurred."
				});
			}
		});
});
app.route("/register/done").post(function (request, response) {
	var userID = request.signedCookies.username;
	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Invalid identification cookie"
				});
				return;
			}
			db.newGraphReader()
				.get()
				.from("users", userID)
				.related("attendee")
				.then(function (results) {
					if (results.body.count < 5) {
						// User hasn't actually finished registering
						return Q.reject(new CancelError("Registration isn't completed"));
					}
					results = results.body.results;
					// Make sure that the user has selected one panel
					var hasSelectedPanel = false;
					for (let i = 0; i < results.length; i++) {
						if (!results[i].value.type) {
							hasSelectedPanel = true;
							break;
						}
					}
					if (!hasSelectedPanel) {
						return Q.reject(new CancelError("You must select at least one panel"));
					}
					// Make sure that the user has selected one session
					var hasSelectedSession = false;
					for (let i = 0; i < results.length; i++) {
						if (!!results[i].value.type) {
							hasSelectedSession = true;
							break;
						}
					}
					if (!hasSelectedSession) {
						return Q.reject(new CancelError("You must select at least one global studies or science session"));
					}
					// Done! Mark as registered
					return db.newPatchBuilder("users", userID)
						.add("registered", true)
						.apply();
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
						handleError(err);
						response.status(500).json({
							"error": "An internal server error occurred."
						});
					}
				});
		});
});
app.route("/sessions/:period")
	.get(function (request, response) {
		var period = request.params.period;
		var time;
		switch (period) {
			case "1": // 9:00 AM - first session
				time = 1429707600000;
				break;
			case "2": // 9:55 AM - second session
				time = 1429710900000;
				break;
			case "3": // 11:30 AM - third session
				time = 1429716600000;
				break;
			case "4": // 12:25 PM - fourth session
				time = 1429719900000;
				break;
			case "5": // 1:20 PM - fifth session
				time = 1429723200000;
				break;
			default:
				response.json({
					"error": "Invalid time period selected"
				});
				return;
		}
		var findTime = moment(new Date(time)).utc().format("ddd MMM DD YYYY HH:mm:ss [GMT+00:00]"); // Formatted like the UTC string respresentation in the database

		Q.all([
			db.search("panels", `value.time.start: "${findTime}"`),
			db.search("sessions", `value.time.start: "${findTime}"`)
		]).then(function (results) {
				var results1 = results[0].body.results.concat();
				var results2 = results[1].body.results.concat();
				var availableSessions = results1.concat(results2);
				availableSessions = availableSessions.map(function (session) {
					var sessionObject = session.value;
					sessionObject.id = session.path.key;
					// IE doesn't parse certain kinds of date strings
					sessionObject.time.start = new Date(sessionObject.time.start).toJSON();
					sessionObject.time.end = new Date(sessionObject.time.end).toJSON();
					return sessionObject;
				});
				// Sort by title
				availableSessions.sort(function (a, b) {
					a = a.name.toLowerCase();
					b = b.name.toLowerCase();
					if (a < b) return -1;
					if (a > b) return 1;
					return 0;
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
					handleError(err);
					response.status(500).json({
						"error": "An internal server error occurred."
					});
				}
			});
	})
	.post(postParser, function (request, response) {
		// Register the user for their selected choice
		var userID = request.signedCookies.username;
		var sessionID = request.body.session;
		if (!userID || !sessionID) {
			response.status(400).send({
				"error": "Missing attendee ID or session ID"
			});
			return;
		}

		var sessionKey = sessionID;
		var attendeeKey = userID;
		var sessionInfo = null;
		var sessionCollection = null;
		var userInfo = null;

		Q.all([
			db.search("users", `@path.key: ${attendeeKey}`),
			db.search("panels", `@path.key: ${sessionKey}`),
			db.search("sessions", `@path.key: ${sessionKey}`)
		]).then(function (results) {
			var userResults = results[0].body.results;
			var panelResults = results[1].body.results;
			var sessionResults = results[2].body.results;

			if (userResults.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			userInfo = userResults[0];

			if (panelResults.length !== 1 && sessionResults.length !== 1) {
				return Q.reject(new CancelError("Invalid session ID."));
			}
			if (panelResults.length === 1) {
				sessionInfo = panelResults[0].value;
				sessionInfo.id = panelResults[0].path.key;
				sessionCollection = "panels";
			}
			if (sessionResults.length === 1) {
				sessionInfo = sessionResults[0].value;
				sessionInfo.id = sessionResults[0].path.key;
				sessionCollection = "sessions";
			}
			return db.newGraphReader()
				.get()
				.from("users", userID)
				.related("attendee");
		})
		.then(function (results) {
			results = results.body.results;
			var previousSession = null;
			for (let i = 0; i < results.length; i++) {
				if (results[i].value.time.start === sessionInfo.time.start) {
					previousSession = results[i];
				}
			}
			if (previousSession) {
				// Deregister
				var deregistrationPromises = [
					db.newGraphBuilder()
						.remove()
						.from("users", userID)
						.related("attendee")
						.to(previousSession.path.collection, previousSession.path.key),
					db.newGraphBuilder()
						.remove()
						.from(previousSession.path.collection, previousSession.path.key)
						.related("attendee")
						.to("users", userID),
					db.newPatchBuilder(previousSession.path.collection, previousSession.path.key)
						.inc("capacity.taken", -1)
						.apply()
				];
				return Q.all(deregistrationPromises)
					.then(function () {
						return db.newGraphReader()
							.get()
							.from(previousSession.path.collection, previousSession.path.key)
							.related("attendee");
					})
					.then(function (results) {
						var currentAttendees = results.body.total_count || results.body.count;
						io.emit("availability", {
							"session": previousSession.path.key,
							"taken": currentAttendees
						});
						return db.newGraphReader()
							.get()
							.from(sessionCollection, sessionKey)
							.related("attendee");
					});
			}
			else {
				return db.newGraphReader()
					.get()
					.from(sessionCollection, sessionKey)
					.related("attendee");
			}
		})
		.then(function (results) {
			var currentAttendees = results.body.total_count || results.body.count;
			if (currentAttendees >= sessionInfo.capacity.total) {
				return Q.reject(new CancelError("There are too many people in that session. Please choose another."));
			}
			// Broadcast the new number of attendees
			io.emit("availability", {
				"session": sessionID,
				"taken": currentAttendees + 1
			});
			// Proceed with registration for this spot (create a bidirectional relationship)
			var registrationPromises = [];
			registrationPromises.push(
				db.newGraphBuilder()
					.create()
					.from(sessionCollection, sessionKey)
					.related("attendee")
					.to("users", attendeeKey)
			);
			registrationPromises.push(
				db.newGraphBuilder()
					.create()
					.from("users", attendeeKey)
					.related("attendee")
					.to(sessionCollection, sessionKey)
			);
			registrationPromises.push(
				db.newPatchBuilder(sessionCollection, sessionKey)
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
				handleError(err);
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
	handleError(err);
	response.status(500);
	response.send("An internal server error occurred.");
});

const PORT = 80;
const HTTPS_PORT = 443;
var httpsOptions = {
	key: fs.readFileSync("../https/wpp.key"),
	cert: fs.readFileSync("../https/wppsymposium_org.crt"),
	ca: [fs.readFileSync("../https/COMODORSADomainValidationSecureServerCA.crt"), fs.readFileSync("../https/COMODORSAAddTrustCA.crt"), fs.readFileSync("../https/AddTrustExternalCARoot.crt")]
	//secureProtocol: "TLSv1_method"
};

// Set up the Socket.io server
var server = https.createServer(httpsOptions, app).listen(HTTPS_PORT, "0.0.0.0", function () {
	console.log("HTTPS server listening on port " + HTTPS_PORT);
});
var io = require("socket.io").listen(server);

http.createServer(app).listen(PORT, "0.0.0.0", function() {
	console.log("HTTP server listening on port " + PORT);
});
