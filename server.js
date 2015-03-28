"use strict";
var crypto = require("crypto");
var fs = require("fs");

var moment = require("moment");
var Promise = require("bluebird");
//Promise.longStackTraces();
fs = Promise.promisifyAll(fs);
var r = require("rethinkdb");

// Initialize the database connection
var DBConnection = undefined;
function intializeDatabase() {
	r.connect({"db": "wpp", "timeout": 20})
		.then(function (connection) {
			DBConnection = connection;
			console.log("Connected to RethinkDB successfully");
		})
		.error(function (err) {
			// Can't connect to the database
			// Fatal error
			throw err;
		});
}
function destroyDatabase() {
	DBConnection.close();
}
intializeDatabase();

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
		"secure": false, // Set this to true when you get a doman + SSL cert
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
	r.table("attendees").filter({"code": code}).count().run(DBConnection)
		.then(function (count) {
			if (count !== 1) {
				response.redirect("/register");
				return;
			}
			fs.readFileAsync("register.html", {"encoding": "utf8"})
				.then(function (html) {
					response.send(html);
				})
		})
});
// AJAX endpoints
app.route("/info/:code").get(function (request, response) {
	var code = request.params.code.toString();
	r.table("attendees").filter({"code": code}).run(DBConnection).then(function (cursor) {
		return cursor.next();
	}).then(function (data) {
		response.json({
			"id": data.id,
			"code": data.code,
			"name": data.name,
			"email": data.email
		});
	}).error(function() {
		response.status(404).json({
			"error": "No user with that registration code exists"
		});
	});
});
app.route("/sessions/panels")
	.get(function (request, response) {
		r.table("panels").orderBy("name").run(DBConnection).then(function (data) {
			response.send(data);
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
		var sessionTimeKey;
		// Confirm that this user exists
		r.table("attendees").filter({"code": userID}).run(DBConnection)
			.then(function (user) {
				if (!user) {
					return Promise.reject(new CancelError("Invalid user ID"));
				}
				// Make sure that this is possible and increment the "taken field"
				return r.table("panels").get(sessionID).run(DBConnection);
			})
			.then(function (panel) {
				if (!panel) {
					return Promise.reject(new CancelError("Invalid session ID"));
				}
				// Check if it has a valid time slot
				switch (new Date(panel.time.start).valueOf()) {
					case 1429707600000: // 9:00 AM - first session
						sessionTimeKey = "first";
						break;
					case 1429710900000: // 9:55 AM - second session
						sessionTimeKey = "second";
						break;
					case 1429716600000: // 11:30 AM - third session
						sessionTimeKey = "third";
						break;
					case 1429719900000: // 12:25 PM - fourth session
						sessionTimeKey = "fourth";
						break;
					case 1429723200000: // 1:20 PM - fifth session
						sessionTimeKey = "fifth";
						break;
					default:
						return Promise.reject(new CancelError("Invalid session time slot"));
				}
				if (panel.capacity.taken >= panel.capacity.total) {
					// Too many people in this session
					return Promise.reject(new CancelError("There are too many people in that panel. Please choose another."));
				}
				return r.table("panels").get(sessionID).update({
					"capacity": {
						"total": r.row("capacity")("total"),
						"taken": r.row("capacity")("taken").add(1)
					}
				}).run(DBConnection);
			})
			.then(function () {
				return r.table("panels").get(sessionID).run(DBConnection);
			})
			.then(function (panel) {
				// Broadcast the new number of spots
				io.emit("availability", {
					"session": sessionID,
					"taken": panel.capacity.taken
				});
				// Put the session in the user's database entry
				//return r.table("attendees").filter({"code": userID})
			})
			.catch(CancelError, function (err) {
				response.send({
					"error": err.message
				});
			})
	});
app.route("/sessions/wpp").get(function (request, response) {
	r.table("sessions").filter({"type": "wpp"}).orderBy("name").run(DBConnection).then(function (data) {
		response.send(data);
	});
});
app.route("/sessions/science").get(function (request, response) {
	r.table("sessions").filter({"type": "science"}).orderBy("name").run(DBConnection).then(function (data) {
		response.send(data);
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