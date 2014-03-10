/// <reference path="typescript_defs/node.d.ts" />
/// <reference path="typescript_defs/express3.d.ts" />
/// <reference path="typescript_defs/mongodb.d.ts" />
import express3 = require("express3");
import mongodb = require("mongodb")
var StartUpTime: number = Date.now();
var PORT: number = 8080;

var http = require("http");
var crypto = require("crypto");

var MongoClient = require("mongodb").MongoClient;
MongoClient.connect("mongodb://localhost:27017/wpp", function(err: any, db: mongodb.Db) {
if (err)
	throw err

var Collections: {
	Users: mongodb.Collection;
} = {
	Users: db.collection("users")
};

var nodemailer = require("nodemailer");
var express = require("express");
var app: express3.Application = express();

app.use(express.compress());
//app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.session({
	secret: "5e3e4acccc5de18e9e44c5c34da5da7f658301e35c5da6471b8cee83b855d587",
	cookie: {
		path: "/",
		httpOnly: true,
		maxAge: 3600000 * 24 * 7 // 1 week
	}
}));
require("express-persona")(app, {
	audience: "http://192.168.70.32:" + PORT // Change this for production uses
});

app.set("views", __dirname + "/views");
app.set("view engine", "jade");

app.use("/css", express.static("css"));
app.use("/js", express.static("js"));
app.use("/ratchet", express.static("ratchet"));
app.use("/img", express.static("img"));

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
var adminEmails: string[] = ["petschekr@gfacademy.org", "beckerju@gfacademy.org", "jmirza@gfacademy.org", "vllanque@gfacademy.org"];

app.get("/", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var admin: boolean = !(!loggedIn || adminEmails.indexOf(email) == -1);
	response.render("index", {title: "World Perspectives Symposium", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});
app.get("/explore", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var admin: boolean = !(!loggedIn || adminEmails.indexOf(email) == -1);
	response.render("explore", {title: "Explore", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});


app.get("/login", function(request: express3.Request, response: express3.Response): void {
	var code = request.query.code;
	var username = request.query.username;
	Collections.Users.findOne({username: username, code: code}, function(err, user) {
		if (err) {
			response.json({
				"error": "The database encountered an error",
				"info": err
			});
			return;
		}
		if (!user) {
			response.json({
				"error": "Incorrect code",
				"info": err
			});
			return;
		}
		request.session["email"] = user.email;
		Collections.Users.update({username: username}, {$set: {code: ""}}, {"w": 0}, function() {});
		response.json({
			"success": "Logged in successfully"
		});
	});
});
app.get("/logout", function(request: express3.Request, response: express3.Response): void {
	request.session["email"] = undefined;
	response.json({
		"success": "Logged out successfully"
	})
});
app.post("/login", function(request: express3.Request, response: express3.Response): void {
	var username: string = request.body.username;
	if (!username) {
		response.json({
			"error": "FirstClass username not provided"
		});
		return;
	}
	var email: string = username + "@gfacademy.org";
	createNonce(function(code: string): void {
		var smtpTransport: any = nodemailer.createTransport("SMTP", {
			service: "Gmail",
			auth: {
				// Sent from petschekr@gmail.com (Temporary)
				user: "petschekr@gmail.com",
				pass: "zvkmegclukmcognx"
			}
		});
		var mailOptions: {
			from: string;
			to: string;
			subject: string;
			text: string;
			html: string;
		} = {
			from: "World Perspectives Program <petschekr@gmail.com>",
			to: email,
			subject: "Login Code",
			text: "Your login code is:\n\n" + code,
			html: "<h4>Your login code is:</h4><span>" + code + "</span>"
		};
		smtpTransport.sendMail(mailOptions, function(err: any, emailResponse: any): void {
			if (err) {
				console.log(err);
				response.json({
					"error": "Email failed to send",
					"info": err
				});
				return;
			}
			Collections.Users.findOne({username: username}, function(err, previousUser) {
				if (previousUser) {
					Collections.Users.update({username: username}, {$set: {code: code}}, {w:1}, function(err) {
						if (err) {
							response.json({
								"error": "The database encountered an error",
								"info": err
							});
							return;
						}
					});
				}
				else {
					Collections.Users.insert({
						"username": username,
						"email": email,
						"code": code
					}, {w:1}, function(err: any): void {
						if (err) {
							response.json({
								"error": "The database encountered an error",
								"info": err
							});
							return;
						}
					});
				}
				response.json({
					"success": "Email sent successfully"
				});
			});
			smtpTransport.close();
		});
	}, 4);
});

// Admin pages
function AdminAuth(request: express3.Request, response: express3.Response, next: any):void {
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	if (!loggedIn || adminEmails.indexOf(email) == -1) {
		console.warn("/admin request rejected. Email: " + email + ", loggedIn: " + loggedIn);
		response.redirect("/");
		return;
	}
	next();
}
app.get("/admin", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
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
	console.log("Startup time: " + (Date.now() - StartUpTime) + "ms");
});
}); // End of MongoDB db function