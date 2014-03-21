/// <reference path="typescript_defs/node.d.ts" />
/// <reference path="typescript_defs/express3.d.ts" />
/// <reference path="typescript_defs/mongodb.d.ts" />
import express3 = require("express3");
import mongodb = require("mongodb");
var StartUpTime: number = Date.now();
var PORT: number = 8080;

var adminEmails: string[] = ["petschekr@gfacademy.org", "beckerju@gfacademy.org", "jmirza@gfacademy.org", "vllanque@gfacademy.org"];
interface ScheduleItem {
	title: string;
	start: Date;
	end: Date;
	sessionNumber?: number;
}
var Schedule: ScheduleItem[] = [
	{
		title: "Advisory",
		start: new Date("Apr 23, 2014 8:00 EDT"),
		end: new Date("Apr 23, 2014 8:15 EDT")
	},
	{
		title: "Introduction",
		start: new Date("Apr 23, 2014 8:20 EDT"),
		end: new Date("Apr 23, 2014 8:45 EDT")
	},
	{
		title: "Global Health in Local Context",
		start: new Date("Apr 23, 2014 8:50 EDT"),
		end: new Date("Apr 23, 2014 9:40 EDT"),
		sessionNumber: 1
	},
	{
		title: "Globalizaton and its Discontents",
		start: new Date("Apr 23, 2014 9:50 EDT"),
		end: new Date("Apr 23, 2014 10:40 EDT"),
		sessionNumber: 2
	},
	{
		title: "Lunch",
		start: new Date("Apr 23, 2014 10:45 EDT"),
		end: new Date("Apr 23, 2014 11:30 EDT")
	},
	{
		title: "Science, Technology, and Change",
		start: new Date("Apr 23, 2014 11:40 EDT"),
		end: new Date("Apr 23, 2014 12:30 EDT"),
		sessionNumber: 3
	},
	{
		title: "The Power of Incentives in Decision-Making",
		start: new Date("Apr 23, 2014 12:40 EDT"),
		end: new Date("Apr 23, 2014 13:30 EDT"),
		sessionNumber: 4
	},
	{
		title: "Advisory",
		start: new Date("Apr 23, 2014 13:40 EDT"),
		end: new Date("Apr 23, 2014 14:00 EDT")
interface Presentation {
	sessionNumber: number;
	sessionID: string;
	attendanceCode: string;
	//presenter: Student;
	presenter: string;
	title: string;
	media: {mainVideo?: string; images?: string[]; videos?: string[]};
	abstract: string;
}
	}
];

var http = require("http");
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var MongoClient = require("mongodb").MongoClient;
MongoClient.connect("mongodb://localhost:27017/wpp", function(err: any, db: mongodb.Db) {
if (err)
	throw err

var Collections: {
	Users: mongodb.Collection;
	Schedule: mongodb.Collection;
	Presentations: mongodb.Collection;
} = {
	Users: db.collection("users"),
	Schedule: db.collection("schedule"),
	Presentations: db.collection("presentations")
};

var nodemailer = require("nodemailer");
var async = require("async");
var express = require("express");
var mime = require("mime");
var app: express3.Application = express();

app.use(express.compress());
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({
	secret: "5e3e4acccc5de18e9e44c5c34da5da7f658301e35c5da6471b8cee83b855d587",
	cookie: {
		path: "/",
		httpOnly: true,
		maxAge: 3600000 * 24 * 7 // 1 week
	}
}));

app.set("views", __dirname + "/views");
app.set("view engine", "jade");
app.use(express.errorHandler());
app.locals.pretty = true;

app.use("/css", express.static("css"));
app.use("/js", express.static("js"));
app.use("/ratchet", express.static("ratchet"));
app.use("/img", express.static("img"));
app.use("/media", express.static("media"));

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
function getTime(date: Date): string {
	var dateString: string = "";
	if (date.getHours() == 12)
		dateString += date.getHours();
	else
		dateString += (date.getHours() % 12);
	dateString += ":";
	dateString += date.getMinutes();
	dateString += (date.getMinutes().toString().length == 1 ? "0" : "");
	dateString += " ";
	dateString += (date.getHours() >= 12 ? "PM" : "AM");
	return dateString;
}

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
app.get("/schedule", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var admin: boolean = !(!loggedIn || adminEmails.indexOf(email) == -1);
	var scheduleForJade: any = [];
	for (var i: number = 0, len: number = Schedule.length; i < len; i++) {
		var scheduleItem: any = {
			title: Schedule[i].title,
			start: getTime(Schedule[i].start),
			end: getTime(Schedule[i].end)
		}
		scheduleForJade.push(scheduleItem);
	}
	response.render("schedule", {
		title: "My Schedule",
		mobileOS: platform,
		loggedIn: loggedIn,
		email: email,
		admin: admin,
		renderSchedule: scheduleForJade,
		realSchedule: Schedule
	}, function(err: any, html: string): void {
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
app.get("/admin/attendance", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	response.render("admin/attendance", {title: "Attendance", mobileOS: platform, loggedIn: loggedIn, email: email}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});
app.get("/admin/attendance/:sessionNumber", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var sessionNumber: number = parseInt(request.params["sessionNumber"], 10);
	if (isNaN(sessionNumber)) {
		response.redirect("/admin/attendance");
		return;
	}
	response.render("admin/attendance", {title: "Attendance Session " + sessionNumber, mobileOS: platform, loggedIn: loggedIn, email: email, sessionNumber: sessionNumber}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});
app.get("/admin/presentations", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];

	Collections.Presentations.find().toArray(function(err: any, presentations: Presentation[]): void {
		response.render("admin/sessions", {title: "Presentations", mobileOS: platform, loggedIn: loggedIn, email: email, presentations: presentations}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
	});
});
app.get("/admin/presentations/:id", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var presentationID = request.params.id;

	Collections.Presentations.findOne({"sessionID": presentationID}, function(err: any, presentation: Presentation): void {
		if (!presentation) {
			response.redirect("/admin/presentations");
			return;
		}
		var startTime: string;
		var endTime: string;
		for (var i: number = 0; i < Schedule.length; i++) {
			if (Schedule[i].sessionNumber === presentation.sessionNumber) {
				startTime = getTime(Schedule[i].start);
				endTime = getTime(Schedule[i].end);
				break;
			}
		}
		response.render("presentation", {title: "Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, fromAdmin: true, presentation: presentation, startTime: startTime, endTime: endTime}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
	});
});
app.post("/admin/presentations", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var data: {
		name: string;
		title: string;
		youtubeID: string;
		uploadedMedia: string[];
		abstract: string;
		session: number;
		//email: string;
	} = {
		"name": request.body.name || "",
		"title": request.body.title || "",
		"youtubeID": request.body.youtubeID || undefined,
		"uploadedMedia": [],
		"abstract": request.body.abstract || "",
		"session": parseInt(request.body.session, 10)
	};
	try {
		if (request.body.uploadedMedia)
			data.uploadedMedia = JSON.parse(request.body.uploadedMedia);
	}
	catch (e) {
		response.send({
			"status": "failure",
			"reason": "Invalid JSON"
		});
		return;
	}
	if (isNaN(data.session) || data.name === "" || data.title === "" || data.abstract === "") {
		response.send({
			"status": "failure",
			"reason": "Invalid information"
		});
		return;
	}
	var presentation: Presentation = {
		sessionNumber: data.session,
		sessionID: undefined,
		attendanceCode: undefined,
		presenter: data.name,
		title: data.title,
		media: {
			mainVideo: data.youtubeID,
			images: [],
			videos: []
		},
		abstract: data.abstract
	}
	var imageType: RegExp = /image.*/;
	var videoType: RegExp = /video.*/;
	for (var i: number = 0; i < data.uploadedMedia.length; i++) {
		var file: string = data.uploadedMedia[i];
		var mimeType: string = mime.lookup(file);
		var image: boolean = !!mimeType.match(imageType);
		var video: boolean = !!mimeType.match(videoType);
		if (image) {
			presentation.media.images.push(file);
		}
		if (video) {
			presentation.media.videos.push(file);
		}
	}
	// Generate a sessionID
	presentation.sessionID = crypto.randomBytes(8).toString("hex");
	// Generate an attendance code (6 digits)
	var code: NodeBuffer = crypto.randomBytes(3);
	presentation.attendanceCode = parseInt(code.toString("hex"), 16).toString().substr(0,6);
	// Retrieve the presenter (or create them if they don't exist in the DB)
	// TODO: name -> email conversion

	Collections.Presentations.insert(presentation, {w:1}, function(err): void {
		if (err) {
			console.error(err);
			response.send({
				"status": "failure",
				"reason": "The database encountered an error"
			});
			return;
		}

		response.send({
			"status": "success",
			"url": "/admin/presentations/" + presentation.sessionID
		});
	});
});
// Media upload for presentations
app.post("/admin/presentations/media", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var key: string;
	var files: any[] = [];
	var urls: string[] = [];
	var ids: string[] = [];
	for (key in request.files) {
		var file: any = request.files[key];
		files.push(file);
	}
	async.eachSeries(files, function(file: any, callback: Function) {
		if (file.type.indexOf("image/") == -1 && file.type.indexOf("video/") == -1) {
			fs.unlink(file.path, function (err: Error): void {
				if (err) {
					console.error(err);
					callback(err);
				}
				console.log("Deleted item with MIME type: " + file.type);
				urls.push(null);
				ids.push(null);
				callback();
			});
		}
		console.log("Valid file with MIME type: " + file.type);
		var id: string = crypto.randomBytes(16).toString("hex");
		// Move the temp file
		var sourceFile = fs.createReadStream(file.path);
		var newFileName: string = "/media/" + id + path.extname(file.path);
		var destFile = fs.createWriteStream(__dirname + newFileName);
		sourceFile.pipe(destFile);
		sourceFile.on("end", function(): void {
			// Delete the temp file
			fs.unlink(file.path, function(err: Error): void {
				if (err) {
					console.error(err)
					callback(err);
				}
				urls.push(newFileName);
				ids.push(id + path.extname(file.path));
				callback();
			});
		});
		sourceFile.on("error", function(err: Error): void {
			// Delete the temp files
			// Who cares if these return errors
			fs.unlink(file.path);
			fs.unlink(__dirname + newFileName);
			callback(err);
		});
	}, function(err: Error) {
		if (err) {
			response.send({
				"status": "error",
				"reason": err
			});
			return;
		}
		response.send({
			"status": "success",
			"urls": urls,
			"ids": ids
		});
	});
});

app.get("/admin/feedback", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	response.render("admin/feedback", {title: "Admin", mobileOS: platform, loggedIn: loggedIn, email: email}, function(err: any, html: string): void {
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
		response.send(404, html);
	});
});

app.listen(PORT, "0.0.0.0", function(): void {
	console.log("Listening on port " + PORT);
	console.log("Startup time: " + (Date.now() - StartUpTime) + "ms");
});
}); // End of MongoDB db function