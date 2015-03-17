"use strict";
var crypto = require("crypto");
var fs = require("fs");

var moment = require("moment");
var Promise = require("bluebird");
var r = require("rethinkdb");

// Initialize the database connection
var DBConnection = undefined;
function intializeDatabase() {
	r.connect({"db": "wpp", "timeout": 20})
		.then(function(connection) {
			DBConnection = connection;
			console.log("Connected to RethinkDB successfully");
		})
		.error(function(err) {
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