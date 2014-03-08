/// <reference path="typescript_defs/node.d.ts" />
/// <reference path="typescript_defs/express3.d.ts" />
import express3 = require("express3");
var PORT: number = 8080;

var http = require("http");
var crypto = require("crypto");

var express = require("express");
var app: express3.Application = express();

app.use(express.compress());
//app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.urlencoded());
app.use(express.session({
	secret: "5e3e4acccc5de18e9e44c5c34da5da7f658301e35c5da6471b8cee83b855d587"
}));
require("express-persona")(app, {
	audience: "http://localhost:" + PORT // Change this for production uses
});

app.set("views", __dirname + "/views");
app.set("view engine", "jade");

app.use("/css", express.static("css"));
app.use("/js", express.static("js"));
app.use("/ratchet", express.static("ratchet"));

function createNonce (cb: (nonce: string) => any, bytes: number = 32): void {
	crypto.randomBytes(bytes, function (err, buffer): void {
		cb(buffer.toString("hex"));
	});
}
function getPlatform (request: express3.Request): string {
	var UA: string = request.headers["user-agent"];
	if (!UA) {
		return "Unknown";
	}
	UA = UA.toLowerCase();
	if (UA.indexOf("android") != -1) {
		return "Android";
	}
	if (UA.indexOf("iphone") != -1 || UA.indexOf("ipod") != -1 || UA.indexOf("ipad") != -1) {
		return "iOS";
	}
	return "Desktop";
}

app.get("/", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	response.render("index", {title: "Explore", mobileOS: platform, loggedIn: loggedIn, email: email}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});

var adminEmails: string[] = ["petschekr@gmail.com", "petschekr@gfacademy.org", "amirza@gfacademy.org", "vllanque@gfacademy.org"]
// Admin pages
app.get("/admin", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	if (!loggedIn || adminEmails.indexOf(email) != -1) {
		response.redirect("/?message=authfail")
		return;
	}
	response.render("admin", {title: "Admin", mobileOS: platform, loggedIn: loggedIn, email: email}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});

// 404 Not Found
app.use(function(request: express3.Request, response: express3.Response, next): void {
	response.render("404", {title: "404 Not Found", url: request.url}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});

app.listen(PORT, "0.0.0.0", function(): void {
	console.log("Listening on port " + PORT);
});