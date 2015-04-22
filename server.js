/*jslint node: true */
/*jslint esnext: true */
"use strict";
var crypto = require("crypto");
var fs = require("fs");
var http = require("http");
var https = require("https");
var urllib = require("url");

var moment = require("moment");
var csv = require("csv");
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
var sendgrid  = require("sendgrid")("petschekr", "WPP 2015");

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

var scheduleResponseTemplate = [
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
			response.cookie("username", username, cookieOptions);
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
app.route("/admin").get(function (request, response) {
	var userID = request.signedCookies.username;
	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.redirect("/");
				return;
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				response.redirect("/");
				return;
			}
			else {
				fs.readFileAsync("admin.html", {"encoding": "utf8"})
					.then(function (html) {
						response.send(html);
					});
			}
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
	var scheduleResponse = JSON.parse(JSON.stringify(scheduleResponseTemplate)); // Deep copy hack
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
						return graphReaderGetAll(previousSession.path.collection, previousSession.path.key, "attendee");
					})
					.then(function (results) {
						var currentAttendees = results.length;
						io.emit("availability", {
							"session": previousSession.path.key,
							"taken": currentAttendees
						});
						return graphReaderGetAll(sessionCollection, sessionKey, "attendee");
					});
			}
			else {
				return graphReaderGetAll(sessionCollection, sessionKey, "attendee");
			}
		})
		.then(function (results) {
			var currentAttendees = results.length;
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
app.route("/admin/add/:type").post(postParser, function (request, response) {
	var userID = request.signedCookies.username;
	var data = request.body.data;
	var type = request.params.type;
	if (!type)
		type = "students";

	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			if (!data) {
				return Q.reject(new CancelError("Missing data to import"));
			}
			// Parse as CSV
			return Q.nfcall(csv.parse, data.toString(), {
				"columns": ["firstName", "lastName", "email"]
			});
		})
		.then(function (students) {
			var usernameRegExp = /^(.*?)@gfacademy\.org$/i;
			students = students.map(function (student) {
				var studentObject = {};
				studentObject.name = student.firstName + " " + student.lastName;
				studentObject.code = crypto.randomBytes(16).toString("hex");
				if (type === "faculty")
					studentObject.faculty = true;
				try {
					studentObject.username = student.email.match(usernameRegExp)[1];
				}
				catch (e) {
					studentObject = undefined;
					console.log("Skipped", student, "due to invalid email");
				}
				return studentObject;
			});
			var studentAddPromises = [];
			students.forEach(function (student) {
				if (student) {
					studentAddPromises.push(
						db.put("users", student.username, {
							"name": student.name,
							"code": student.code,
							"faculty": student.faculty
						})
					);
				}
			});
			return Q.all(studentAddPromises);
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
app.route("/admin/send").post(function (request, response) {
	var userID = request.signedCookies.username;

	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}

			// Get list of users
			return db.newSearchBuilder()
				.collection("users")
				.limit(100)
				.query("value.registered: (NOT true)");
		})
		.then(function (results) {
			var allPeople = [
				{
					"path": {
						"key": "petschekr"
					},
					"value": {
						"name": "Ryan Petschek",
						"code": "a1bd5967ba0f9d55ee4e84d268078b83"
					}
				}
			];
			allPeople = allPeople.concat(results.body.results);

			function promiseWhile (condition, body) {
				var done = Q.defer();
				function loop() {
					if (!condition())
						return done.resolve(allPeople);
					body().then(loop).fail(done.reject);
				}
				Q.fcall(loop);
				return done.promise;
			}

			var currentResults = results;

			return promiseWhile(
				function () {
					return currentResults.links && currentResults.links.next;
				},
				function () {
					return currentResults.links.next.get().then(function (newResults) {
						allPeople = allPeople.concat(newResults.body.results);
						currentResults = newResults;
						return Q.resolve();
					});
				}
			);
		})
		.then(function (allPeople) {
			allPeople = allPeople.map(function (person) {
				var infoObject = {};
				infoObject.name = person.value.name;
				infoObject.code = person.value.code;
				infoObject.email = person.path.key + "@gfacademy.org";
				return infoObject;
			});

			var emailPromises = [];
			allPeople.forEach(function (person) {
				var email = new sendgrid.Email({
					to: person.email,
					from: "registration@wppsymposium.org",
					subject: "WPP Symposium Registration",
					text:
`Hi ${person.name},

You can register for this year's World Perspectives Symposium by clicking the following link:

https://wppsymposium.org/login/${person.code}

Feel free to reply to this email if you're having any problems.

Thanks,
The GFA World Perspectives Program Team`
				});
				var deferrer = Q.defer();
				sendgrid.send(email, function (err, json) {
					if (err) {
						deferrer.reject(err);
					}
					else {
						setTimeout(function() {
							console.log("Sent to:", email.to);
							deferrer.resolve(json);
						}, 2000);
					}
				});
				emailPromises.push(deferrer.promise);
			});
			console.log("Total people:", allPeople.length);
			console.log("Total promises:", emailPromises.length);

			return Q.all(emailPromises);
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
app.route("/admin/schedule/search").get(function (request, response) {
	var userID = request.signedCookies.username;
	var search = request.query.q;

	db.search("users", `@path.key: ${userID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			if (!search) {
				return Q.reject(new CancelError("Missing search query"));
			}
			return db.search("users", `value.name: ${search}`);
		})
		.then(function (searchResults) {
			searchResults = searchResults.body.results.map(function (result) {
				var newResult = {};
				newResult.name = result.value.name;
				newResult.username = result.path.key;
				newResult.registered = !!result.value.registered;
				return newResult;
			});
			response.json({
				"success": true,
				"results": searchResults
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
app.route("/admin/schedule/all").get(function (request, response) {
	fs.readFileAsync("components/admin/schedule.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/admin/schedule/all/info").get(function (request, response) {
	var adminUserID = request.signedCookies.username;

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

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return searchGetAll("users", "*");
		})
		.then(function (results) {
			if (results.length < 1) {
				response.status(403).json({
					"error": "No users"
				});
				return;
			}
			results = results.map(function (result) {
				var newResult = {};
				newResult.code = result.value.code;
				newResult.name = result.value.name;
				newResult.username = result.path.key;
				newResult.admin = !!result.value.admin;
				return newResult;
			}).sort(function (a, b) {
				a = a.name.toLowerCase().split(" ");
				a = a[a.length - 1];
				b = b.name.toLowerCase().split(" ");
				b = b[b.length - 1];
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			});
			response.json(results);
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
app.route("/admin/schedule/all/schedule").get(function (request, response) {
	var adminUserID = request.signedCookies.username;

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

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return searchGetAll("users", "*");
		})
		.then(function (results) {
			if (results.length < 1) {
				response.status(403).json({
					"error": "No users",
					"data": [scheduleResponseTemplate.slice()]
				});
				return Q.reject(new CancelError("handled"));
			}

			var graphPromises = results.sort(function (a, b) {
				a = a.value.name.toLowerCase();
				b = b.value.name.toLowerCase();
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			}).map(function (user) {
				var scheduleResponse = JSON.parse(JSON.stringify(scheduleResponseTemplate)); // Deep copy hack
				if (!user.value.registered) {
					return scheduleResponse; // Return the default schedule for this user
				}
				var deferrer = Q.defer();

				db.newGraphReader()
					.get()
					.from("users", user.path.key)
					.related("attendee")
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
						deferrer.resolve(scheduleResponse);
					})
					.fail(deferrer.reject);

				return deferrer.promise;
			});
			return Q.all(graphPromises);
		})
		.then(function (results) {
			response.json({
				"data": results
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
app.route("/admin/schedule/get/:username").get(function (request, response) {
	fs.readFileAsync("components/admin/schedule.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/admin/schedule/get/:username/info").get(function (request, response) {
	var adminUserID = request.signedCookies.username;
	var userID = request.params.username;

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return db.search("users", `@path.key: ${userID}`);
		})
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Invalid username"
				});
				return;
			}
			var result = results[0];
			response.json([{
				"code": result.value.code,
				"name": result.value.name,
				"username": result.path.key,
				"admin": !!result.value.admin
			}]);
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
app.route("/admin/schedule/get/:username/schedule").get(function (request, response) {
	var adminUserID = request.signedCookies.username;
	var userID = request.params.username;
	var user = null;
	var scheduleResponse = JSON.parse(JSON.stringify(scheduleResponseTemplate)); // Deep copy hack
	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return db.search("users", `@path.key: ${userID}`);
		})
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Invalid username",
					"data": [scheduleResponse]
				});
				return Q.reject(new CancelError("handled"));
			}
			user = results[0];
			if (!user.value.registered) {
				response.json({
					"registered": false,
					"data": [scheduleResponse]
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
				"data": [scheduleResponse]
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
app.route("/admin/panels/all").get(function (request, response) {
	fs.readFileAsync("components/admin/panel.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/admin/panels/all/info").get(function (request, response) {
	var adminUserID = request.signedCookies.username;

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

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return searchGetAll("panels", "*");
		})
		.then(function (results) {
			if (results.length < 1) {
				response.status(403).json({
					"error": "No panels"
				});
				return;
			}
			var graphPromises = results.sort(function (a, b) {
				a = a.value.name.toLowerCase();
				b = b.value.name.toLowerCase();
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			}).map(function (panel) {
				var deferrer = Q.defer();

				graphReaderGetAll("panels", panel.path.key, "attendee")
					.then(function(attendees) {
						var toResolve = panel.value;
						toResolve.id = panel.path.key;
						toResolve.attendees = attendees.sort(function (a, b) {
							a = a.value.name.toLowerCase().split(" ");
							a = a[a.length - 1];
							b = b.value.name.toLowerCase().split(" ");
							b = b[b.length - 1];
							if (a < b) return -1;
							if (a > b) return 1;
							return 0;
						}).map(function (attendee) {
							return {
								"name": attendee.value.name,
								"username": attendee.path.key,
								"faculty": !!attendee.value.faculty
							};
						});
						deferrer.resolve(toResolve);
					})
					.fail(deferrer.reject);

				return deferrer.promise;
			});
			return Q.all(graphPromises);
		})
		.then(function (results) {
			response.json(results);
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
app.route("/admin/panels/get/:id").get(function (request, response) {
	fs.readFileAsync("components/admin/panel.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/admin/panels/get/:id/info").get(function (request, response) {
	var adminUserID = request.signedCookies.username;
	var panelID = request.params.id;

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

	var panel = null;

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return db.search("panels", `@path.key: ${panelID}`);
		})
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Unknown panel"
				});
				return;
			}
			panel = results[0];
			return graphReaderGetAll("panels", panelID, "attendee");
		})
		.then(function (attendees) {
			attendees = attendees.sort(function (a, b) {
				a = a.value.name.toLowerCase().split(" ");
				a = a[a.length - 1];
				b = b.value.name.toLowerCase().split(" ");
				b = b[b.length - 1];
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			}).map(function (attendee) {
				return {
					"name": attendee.value.name,
					"username": attendee.path.key,
					"faculty": !!attendee.value.faculty
				};
			});
			panel = panel.value;
			panel.id = panelID;
			panel.attendees = attendees;
			response.json([panel]);
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
app.route("/admin/sessions/all").get(function (request, response) {
	fs.readFileAsync("components/admin/session.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/admin/sessions/all/info").get(function (request, response) {
	var adminUserID = request.signedCookies.username;

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

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return searchGetAll("sessions", "*");
		})
		.then(function (results) {
			if (results.length < 1) {
				response.status(403).json({
					"error": "No sessions"
				});
				return;
			}
			var graphPromises = results.sort(function (a, b) {
				a = a.value.name.toLowerCase();
				b = b.value.name.toLowerCase();
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			}).map(function (session) {
				var deferrer = Q.defer();

				graphReaderGetAll("sessions", session.path.key, "attendee")
					.then(function(attendees) {
						var toResolve = session.value;
						toResolve.id = session.path.key;
						toResolve.attendees = attendees.sort(function (a, b) {
							a = a.value.name.toLowerCase().split(" ");
							a = a[a.length - 1];
							b = b.value.name.toLowerCase().split(" ");
							b = b[b.length - 1];
							if (a < b) return -1;
							if (a > b) return 1;
							return 0;
						}).map(function (attendee) {
							return {
								"name": attendee.value.name,
								"username": attendee.path.key,
								"faculty": !!attendee.value.faculty
							};
						});
						deferrer.resolve(toResolve);
					})
					.fail(deferrer.reject);

				return deferrer.promise;
			});
			return Q.all(graphPromises);
		})
		.then(function (results) {
			response.json(results);
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
app.route("/admin/sessions/get/:id").get(function (request, response) {
	fs.readFileAsync("components/admin/session.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
app.route("/admin/sessions/get/:id/info").get(function (request, response) {
	var adminUserID = request.signedCookies.username;
	var sessionID = request.params.id;

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

	var session = null;

	db.search("users", `@path.key: ${adminUserID}`)
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				return Q.reject(new CancelError("Invalid indentification cookie"));
			}
			// Reject request if not admin
			if (!results[0].value.admin) {
				return Q.reject(new CancelError("You don't have permission to do that"));
			}
			return db.search("sessions", `@path.key: ${sessionID}`);
		})
		.then(function (results) {
			results = results.body.results;
			if (results.length !== 1) {
				response.status(403).json({
					"error": "Unknown session"
				});
				return;
			}
			session = results[0];
			return graphReaderGetAll("sessions", sessionID, "attendee");
		})
		.then(function (attendees) {
			attendees = attendees.sort(function (a, b) {
				a = a.value.name.toLowerCase().split(" ");
				a = a[a.length - 1];
				b = b.value.name.toLowerCase().split(" ");
				b = b[b.length - 1];
				if (a < b) return -1;
				if (a > b) return 1;
				return 0;
			}).map(function (attendee) {
				return {
					"name": attendee.value.name,
					"username": attendee.path.key,
					"faculty": !!attendee.value.faculty
				};
			});
			session = session.value;
			session.id = sessionID;
			session.attendees = attendees;
			response.json([session]);
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
	ca: [fs.readFileSync("../https/COMODORSADomainValidationSecureServerCA.crt"), fs.readFileSync("../https/COMODORSAAddTrustCA.crt"), fs.readFileSync("../https/AddTrustExternalCARoot.crt")],
	//secureProtocol: "TLSv1_method"
	ciphers: "ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-DSS-AES128-GCM-SHA256:kEDH+AESGCM:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA:ECDHE-ECDSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-DSS-AES128-SHA256:DHE-RSA-AES256-SHA256:DHE-DSS-AES256-SHA:DHE-RSA-AES256-SHA:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!3DES:!MD5:!PSK"
};

// Set up the Socket.io server
var server = https.createServer(httpsOptions, app).listen(HTTPS_PORT, "0.0.0.0", function () {
	console.log("HTTPS server listening on port " + HTTPS_PORT);
});
var io = require("socket.io").listen(server);

http.createServer(app).listen(PORT, "0.0.0.0", function() {
	console.log("HTTP server listening on port " + PORT);
});
