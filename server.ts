/// <reference path="typescript_defs/node.d.ts" />
/// <reference path="typescript_defs/express3.d.ts" />
/// <reference path="typescript_defs/mongodb.d.ts" />
import express3 = require("express3");
import mongodb = require("mongodb");
var StartUpTime: number = Date.now();
var PORT: number = 8080;

var adminEmails: string[] = ["petschekr@gfacademy.org", "beckerju@gfacademy.org", "jmirza@gfacademy.org", "vzonta@gfacademy.org"];
interface ScheduleItem {
	title: string;
	start: Date;
	end: Date;
	sessionNumber?: number;
	sessionID?: string;
}
interface Attendance {
	sessionNumber: number;
	sessionID?: string;
	present: boolean;
}
interface SessionChoice {
	sessionNumber: number;
	firstChoice: Presentation;
	secondChoice: Presentation;
	thirdChoice: Presentation;
}
interface Presentation {
	sessionNumber: number;
	sessionID: string;
	attendanceCode: string;
	//presenter: Student;
	presenter: string;
	title: string;
	media: {mainVideo?: string; images?: string[]; videos?: string[]};
	pdfID: string;
	abstract: string;
}
class Student {
	public Name: string;
	public Email: string;
	public Sessions: ScheduleItem[] = [];
	public SessionChoices: SessionChoice[] = [];
	public Attendance: Attendance[] = [];
	public RegisteredForSessions: boolean = false;
	public Admin: boolean = false;
	public Presenter: boolean = false;
	constructor(Name: string, Email: string) {
		this.Name = Name;
		this.Email = Email;
		this.Attendance.push({sessionNumber: 1, present: false});
		this.Attendance.push({sessionNumber: 2, present: false});
		this.Attendance.push({sessionNumber: 3, present: false});
		this.Attendance.push({sessionNumber: 4, present: false});
	}

	checkInToSession(sessionNumber: number, sessionID: string, attendanceCode: number): boolean {
		return false;
	}
	exportUser(): any {
		return {
			Name: this.Name,
			Sessions: this.Sessions,
			SessionChoices: this.SessionChoices,
			Attendance: this.Attendance,
			RegisteredForSessions: this.RegisteredForSessions,
			Admin: this.Admin,
			Presenter: this.Presenter
		};
	}
	importUser(userData: {
		Name: string;
		Sessions: ScheduleItem[];
		SessionChoices: SessionChoice[];
		Attendance: Attendance[];
		RegisteredForSessions: boolean;
		Admin: boolean;
		Presenter: boolean;
	}): void {
		this.Name = userData.Name;
		this.Sessions = userData.Sessions;
		this.SessionChoices = userData.SessionChoices;
		this.Attendance = userData.Attendance;
		this.RegisteredForSessions = userData.RegisteredForSessions;
		this.Admin = userData.Admin;
		this.Presenter = userData.Presenter;
	}
	toString(): string {
		return this.Name;
	}
}

var http = require("http");
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var MongoClient = require("mongodb").MongoClient;
MongoClient.connect("mongodb://nodejitsu:9aef9b4317035915c03da290251ad0ad@troup.mongohq.com:10062/nodejitsudb6476468427", function(err: any, db: mongodb.Db) {
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
// Retrieve the schedule
var Schedule: ScheduleItem[] = [];
function LoadSchedule(): void {
	Collections.Schedule.find().toArray(function(err: Error, scheduleItems: ScheduleItem[]) {
		if (err)
			throw err;
		Schedule = scheduleItems;
		console.log("Schedule loaded from DB");
	});
}
LoadSchedule();

var nodemailer = require("nodemailer");
var async = require("async");
var express = require("express");
var mime = require("mime");
var gm = require("gm");
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

app.use(function (request, response, next) {
	response.setHeader("Strict-Transport-Security", "max-age=8640000; includeSubDomains");
	if (request.headers["x-forwarded-proto"] !== "https") {
		response.redirect(301, "https://" + request.headers.host + "/");
		return;
	}
	next();
});

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
					var user: Student = new Student(username, email);
					Collections.Users.insert({
						"username": username,
						"email": email,
						"code": code,
						"userInfo": user.exportUser()
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
// Feedback form
app.get("/feedback", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var admin: boolean = !(!loggedIn || adminEmails.indexOf(email) == -1);

	response.render("feedback", {
		title: "Feedback",
		mobileOS: platform,
		loggedIn: loggedIn,
		email: email,
		admin: admin,
	}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});	

// Register for sessions
app.get("/register", function(request: express3.Request, response: express3.Response): void {
	//request.session["email"] = "petschekr@gfacademy.org";
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var admin: boolean = !(!loggedIn || adminEmails.indexOf(email) == -1);
	
	response.render("register", {
		title: "Register",
		mobileOS: platform,
		loggedIn: loggedIn,
		email: email,
		admin: admin,
	}, function(err: any, html: string): void {
		if (err)
			console.error(err);
		response.send(html);
	});
});
app.get("/register/:sessionNumber", function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var admin: boolean = !(!loggedIn || adminEmails.indexOf(email) == -1);
	
	var sessionNumber: number = parseInt(request.params.sessionNumber, 10);
	if (isNaN(sessionNumber)) {
		response.redirect("/register");
		return;
	}
	Collections.Presentations.find({"sessionNumber": sessionNumber}).toArray(function(err, presentations: Presentation[]) {
		response.render("register", {
			title: "Session " + sessionNumber.toString(),
			mobileOS: platform,
			loggedIn: loggedIn,
			email: email,
			admin: admin,
			sessionNumber: sessionNumber,
			presentations: presentations
		}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
	});
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

	var userStream = Collections.Users.find({"Admin": {$ne: true}}).stream(); // Only get normal users
	var attendance = {
		"1": {
			"present": 0,
			"absent": 0
		},
		"2": {
			"present": 0,
			"absent": 0
		},
		"3": {
			"present": 0,
			"absent": 0
		},
		"4": {
			"present": 0,
			"absent": 0
		}
	}
	userStream.on("data", function(user) {
		if (user.userInfo.Attendance[0].present)
			attendance[1].present++;
		else
			attendance[1].absent++;
		if (user.userInfo.Attendance[1].present)
			attendance[2].present++;
		else
			attendance[2].absent++;
		if (user.userInfo.Attendance[2].present)
			attendance[3].present++;
		else
			attendance[3].absent++;
		if (user.userInfo.Attendance[3].present)
			attendance[4].present++;
		else
			attendance[4].absent++;
	});
	userStream.on("end", function(): void {
		response.render("admin/attendance", {title: "Attendance", mobileOS: platform, loggedIn: loggedIn, email: email, attendance: attendance}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
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
	var userStream = Collections.Users.find({"Admin": {$ne: true}}).stream(); // Only get normal users
	var attendance: {
		present: string[];
		absent: string[];
	} = {
		present: [],
		absent: []
	};
	userStream.on("data", function(user) {
		if (user.userInfo.Attendance[sessionNumber - 1].present)
			attendance.present.push(user.username);
		else
			attendance.absent.push(user.username);
	});
	userStream.on("end", function(): void {
		response.render("admin/attendance", {title: "Attendance Session " + sessionNumber, mobileOS: platform, loggedIn: loggedIn, email: email, sessionNumber: sessionNumber, attendance: attendance}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
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
app.get("/admin/presentations/edit/:id", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var platform: string = getPlatform(request);
	var loggedIn: boolean = !!request.session["email"];
	var email: string = request.session["email"];
	var presentationID = request.params.id;
	Collections.Presentations.findOne({"sessionID": presentationID}, function(err: any, presentation: Presentation): void {
		if (!presentation) {
			response.redirect("/admin/presentations");
			return;
		}
		response.render("admin/presentation", {title: "Edit Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, fromAdmin: true, presentation: presentation}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
	});
});
app.post("/admin/presentations/edit/:id", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var presentationID = request.params.id;
	var data: {
		"presenter": string;
		"title": string;
		"media.mainVideo": string;
		"abstract": string;
		pdfID?: string;
		"sessionNumber": number;
	} = {
		"presenter": request.body.name || "",
		"title": request.body.title || "",
		"media.mainVideo": request.body.youtubeID || undefined,
		"abstract": request.body.abstract || "",
		"sessionNumber": parseInt(request.body.session, 10)
	};
	if (request.body.uploadedPDF)
		data.pdfID = request.body.uploadedPDF;

	try {
		if (request.body.uploadedMedia)
			data["media.mainVideo"] = JSON.parse(request.body.uploadedMedia);
	}
	catch (e) {
		response.send({
			"status": "failure",
			"reason": "Invalid JSON"
		});
		return;
	}
	if (isNaN(data.sessionNumber) || data.presenter === "" || data.title === "" || data.abstract === "") {
		response.send({
			"status": "failure",
			"reason": "Invalid information"
		});
		return;
	}
	async.parallel([
		function(callback) {
			Collections.Presentations.update({"sessionID": presentationID}, {$set: data}, {w:1}, callback);
		},
		function(callback) {
			var imageType: RegExp = /image.*/;
			var images: string[] = [];
			for (var i: number = 0; i < data["media.mainVideo"].length; i++) {
				var file: string = data["media.mainVideo"][i];
				var mimeType: string = mime.lookup(file);
				var image: boolean = !!mimeType.match(imageType);
				if (image) {
					images.push(file);
				}
			}
			Collections.Presentations.update({"sessionID": presentationID}, {$push: {"media.images": {$each: images}}}, {w:1}, callback);
		}
	], function(err: Error): void {
		if (err) {
			console.error(err);
			response.send({
				"status": "failure",
				"reason": "The database encountered an error"
			});
			return;
		}
		response.send({
			"status": "success"
		});
	});
});
// Delete the presentation
app.delete("/admin/presentations/edit/:id", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var id: string = request.params.id;
	Collections.Presentations.findOne({"sessionID": id}, function(err: any, presentation: Presentation): void {
		// Delete that presentation's media
		var media: string[] = [];
		if (presentation.pdfID)
			media.push(presentation.pdfID);
		media = media.concat(presentation.media.images);
		media = media.concat(presentation.media.videos);
		// Turn the array of IDs into an array of paths
		for (var i: number = 0; i < media.length; i++) {
			media[i] = __dirname + "/media/" + media[i];
		}
		async.parallel([
			function(callback: Function) {
				async.each(media, fs.unlink, callback);
			},
			function(callback: any) {
				// Remove the presentation from the DB
				Collections.Presentations.remove({"sessionID": id}, {w:1}, callback);
			}
		], function(err: Error) {
			if (err) {
				console.error(err);
				response.send({
					"status": "failure",
					"reason": "The database encountered an error"
				});
				return;
			}
			response.send({
				"status": "success"
			});
		});
	});
});
app.get("/admin/presentations/view/:id", AdminAuth, function(request: express3.Request, response: express3.Response): void {
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
		response.render("presentation", {title: "View Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, fromAdmin: true, presentation: presentation, startTime: startTime, endTime: endTime}, function(err: any, html: string): void {
			if (err)
				console.error(err);
			response.send(html);
		});
	});
});
app.get("/admin/presentations/code", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var id: string = request.query.id;
	Collections.Presentations.findOne({"sessionID": id}, function(err: any, presentation: Presentation): void {
		if (!presentation) {
			response.send({
				"status": "error",
				"reason": "Presentation ID invalid or missing"
			});
			return;
		}
		var code: NodeBuffer = crypto.randomBytes(3);
		var attendanceCode: string = parseInt(code.toString("hex"), 16).toString().substr(0,6);
		Collections.Presentations.update({"sessionID": id}, {$set: {attendanceCode: attendanceCode}}, {w:1}, function(err) {
			if (err) {
				console.error(err);
				response.send({
					"status": "error",
					"reason": "The database encountered an error"
				});
				return;
			}
			response.send({
				"status": "success",
				"code": attendanceCode
			});
		});
	});
});
app.post("/admin/presentations", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var data: {
		name: string;
		title: string;
		youtubeID: string;
		uploadedMedia: string[];
		uploadedPDF: string;
		abstract: string;
		session: number;
		//email: string;
	} = {
		"name": request.body.name || "",
		"title": request.body.title || "",
		"youtubeID": request.body.youtubeID || undefined,
		"uploadedMedia": [],
		"uploadedPDF": request.body.uploadedPDF || undefined,
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
		pdfID: data.uploadedPDF,
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
	if (request.body.type == "pdf") {
		// PDF upload
		var pdf = request.files["pdf"];
		if (pdf.type != "application/pdf") {
			fs.unlink(pdf.path, function (err: Error): void {
				if (err) {
					console.error(err);
					response.send({
						"status": "error",
						"reason": err
					});
					return;
				}
				console.log("Deleted item with MIME type: " + pdf.type);
				response.send({
					"status": "error",
					"reason": "Uploaded document is not a PDF"
				});
			});
		}
		else {
			console.log("Valid file with MIME type: " + pdf.type);
			var id: string = crypto.randomBytes(16).toString("hex");
			// Move the temp file
			var sourceFile = fs.createReadStream(pdf.path);
			var newFileName: string = "/media/" + id + path.extname(pdf.path);
			var destFile = fs.createWriteStream(__dirname + newFileName);
			sourceFile.pipe(destFile);
			sourceFile.on("end", function(): void {
				// Delete the temp file
				fs.unlink(pdf.path, function(err: Error): void {
					if (err) {
						console.error(err)
						response.send({
							"status": "error",
							"reason": err
						});
						return;
					}
					response.send({
						"status": "success",
						"id": id + path.extname(pdf.path)
					});
				});
			});
			sourceFile.on("error", function(err: Error): void {
				// Delete the temp files
				// Who cares if these return errors
				fs.unlink(pdf.path);
				fs.unlink(__dirname + newFileName);
				console.error(err);
				response.send({
					"status": "error",
					"reason": err
				});
			});
		}
	}
	else {
		// Media upload
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
						return;
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
						return;
					}
					urls.push(newFileName);
					ids.push(id + path.extname(file.path));

					// Auto rotate and orient the image
					gm(__dirname + newFileName).autoOrient().write(__dirname + newFileName, function(err): void {
						if (err) {
							console.error(err);
							callback(err);
							return;
						}
						callback();
					});
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
					"status": "failure",
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
	}
});
// Delete a media object
app.delete("/admin/presentations/media", AdminAuth, function(request: express3.Request, response: express3.Response): void {
	var id: string = request.body.id;
	async.parallel([
		function(callback: Function) {
			Collections.Presentations.update({"media.images": id}, {$pull: {"media.images": id}}, {w: 1}, function(err: Error) {
				callback(err);
			});
		},
		function(callback: Function) {
			fs.unlink(__dirname + "/media/" + id, function (err: Error): void {
				callback(err);
			});
		}
	], function(err) {
		if (err) {
			console.error(err);
			response.send({
				"status": "failure",
				"reason": "The database encountered an error"
			});
			return;
		}
		response.send({
			"status": "success"
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