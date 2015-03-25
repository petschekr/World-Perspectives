"use strict";
var crypto = require("crypto");
var fs = require("fs");

var moment = require("moment");
var Promise = require("bluebird");
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

var app = express();
var server = require("http").Server(app);

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

	fs.readFileAsync("register.html", {"encoding": "utf8"})
		.then(function (html) {
			response.send(html);
		});
});
// AJAX endpoints
app.route("/info/:code").get(function (request, response) {
	var code = request.params.code.toString();
	response.json({
		"code": code,
		"name": "Ryan Petschek",
		"email": "petschekr@gmail.com"
	});
});
app.route("/sessions/panels").get(function (request, response) {
	r.table("panels").orderBy("name").run(DBConnection).then(function (data) {
		response.send(data);
	});
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