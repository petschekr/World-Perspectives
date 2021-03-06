﻿var StartUpTime = Date.now();
var PORT = 8080;

var adminEmails = ["petschekr@gfacademy.org", "beckerju@gfacademy.org", "jmirza@gfacademy.org", "vllanque@gfacademy.org"];

var Student = (function () {
    function Student(Name, Email) {
        this.Sessions = [];
        this.SessionChoices = [];
        this.Attendance = [];
        this.RegisteredForSessions = false;
        this.Admin = false;
        this.Presenter = false;
        this.Name = Name;
        this.Email = Email;
        this.Attendance.push({ sessionNumber: 1, present: false });
        this.Attendance.push({ sessionNumber: 2, present: false });
        this.Attendance.push({ sessionNumber: 3, present: false });
        this.Attendance.push({ sessionNumber: 4, present: false });
    }
    Student.prototype.checkInToSession = function (sessionNumber, sessionID, attendanceCode) {
        return false;
    };
    Student.prototype.exportUser = function () {
        return {
            Name: this.Name,
            Sessions: this.Sessions,
            SessionChoices: this.SessionChoices,
            Attendance: this.Attendance,
            RegisteredForSessions: this.RegisteredForSessions,
            Admin: this.Admin,
            Presenter: this.Presenter
        };
    };
    Student.prototype.importUser = function (userData) {
        this.Name = userData.Name;
        this.Sessions = userData.Sessions;
        this.SessionChoices = userData.SessionChoices;
        this.Attendance = userData.Attendance;
        this.RegisteredForSessions = userData.RegisteredForSessions;
        this.Admin = userData.Admin;
        this.Presenter = userData.Presenter;
    };
    Student.prototype.toString = function () {
        return this.Name;
    };
    return Student;
})();

var http = require("http");
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

var MongoClient = require("mongodb").MongoClient;
MongoClient.connect("mongodb://localhost:27017/wpp", function (err, db) {
    if (err)
        throw err;

    var Collections = {
        Users: db.collection("users"),
        Schedule: db.collection("schedule"),
        Presentations: db.collection("presentations"),
        Pictures: db.collection("pictures"),
        Names: db.collection("names"),
        Feedback: db.collection("feedback")
    };

    // Retrieve the schedule
    var Schedule = [];
    function LoadSchedule() {
        Collections.Schedule.find().toArray(function (err, scheduleItems) {
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
    var app = express();
    var MongoStore = require("connect-mongo")(express);

    // AWS S3
    var AWS = require("aws-sdk");
    AWS.config.loadFromPath("./aws.json");
    var s3 = new AWS.S3();

    app.use(express.compress());
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.session({
        secret: "5e3e4acccc5de18e9e44c5c34da5da7f658301e35c5da6471b8cee83b855d587",
        cookie: {
            path: "/",
            httpOnly: true,
            maxAge: 3600000 * 24 * 7
        },
        store: new MongoStore({ db: db })
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

    function createNonce(cb, bytes) {
        if (typeof bytes === "undefined") { bytes = 32; }
        crypto.randomBytes(bytes, function (err, buffer) {
            cb(buffer.toString("hex"));
        });
    }
    function getPlatform(request) {
        var UA = request.headers["user-agent"];
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
    function getTime(date) {
        var dateString = "";
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

    app.get("/", function (request, response) {
        response.redirect("/explore");
    });
    app.get("/explore", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        Collections.Presentations.find({}, { sort: "presenter" }).toArray(function (err, presentations) {
            var presenterNames = [];
            for (var i = 0; i < presentations.length; i++) {
                presenterNames.push(presentations[i].presenter);
            }
            var pictures = {};

            // Max concurrent requests is 10
            async.eachLimit(presenterNames, 10, function (presenter, callback) {
                Collections.Pictures.findOne({ "name": presenter }, function (err, presenterMedia) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    if (!presenterMedia) {
                        callback();
                        return;
                    }
                    pictures[presenter] = presenterMedia.picture;
                    callback();
                });
            }, function (err) {
                if (err) {
                    response.set("Content-Type", "text/plain");
                    response.send(500, "A database error occured\n\n" + JSON.stringify(err));
                    return;
                }
                response.render("explore", {
                    title: "Explore",
                    mobileOS: platform,
                    loggedIn: loggedIn,
                    email: email,
                    admin: admin,
                    presentations: presentations,
                    pictures: pictures
                }, function (err, html) {
                    if (err)
                        console.error(err);
                    response.send(html);
                });
            });
        });
    });
    app.get("/explore/:id", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        var presentationID = request.params.id;

        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            if (!presentation) {
                response.redirect("/explore");
                return;
            }
            var startTime;
            var endTime;
            for (var i = 0; i < Schedule.length; i++) {
                if (Schedule[i].sessionNumber === presentation.sessionNumber) {
                    startTime = getTime(Schedule[i].start);
                    endTime = getTime(Schedule[i].end);
                    break;
                }
            }
            var isPresenter = false;
            if (loggedIn) {
                var username = email.match(/^([a-z]{3,}\d?)(@gfacademy.org)?$/i)[1];
                if (username === presentation.presenterUsername || admin) {
                    isPresenter = true;
                }
            }
            response.render("presentation", { title: "View Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin, fromAdmin: false, presentation: presentation, startTime: startTime, endTime: endTime, isPresenter: isPresenter }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });

    app.get("/schedule", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        var scheduleForJade = [];
        for (var i = 0, len = Schedule.length; i < len; i++) {
            var scheduleItem = {
                title: Schedule[i].title,
                start: getTime(Schedule[i].start),
                end: getTime(Schedule[i].end)
            };
            scheduleForJade.push(scheduleItem);
        }
        function respond(presentations, callback) {
            if (typeof presentations === "undefined") { presentations = undefined; }
            if (typeof callback === "undefined") { callback = undefined; }
            response.render("schedule", {
                title: "My Schedule",
                mobileOS: platform,
                loggedIn: loggedIn,
                email: email,
                admin: admin,
                renderSchedule: scheduleForJade,
                realSchedule: Schedule,
                presentations: presentations
            }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
                if (callback)
                    callback();
            });
        }
        if (!loggedIn) {
            respond();
            return;
        }
        async.waterfall([
            function (callback) {
                Collections.Users.findOne({ "email": email }, callback);
            },
            function (user, callback) {
                if (!user || !user.userInfo.RegisteredForSessions) {
                    respond();
                    return;
                }
                async.map(user.userInfo.Sessions, function (sessionItemID, callbackMap) {
                    Collections.Presentations.findOne({ "sessionID": sessionItemID }, callbackMap);
                }, function (err, results) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    respond(results, callback);
                });
            }
        ], function (err) {
            if (err) {
                console.error(err);
                response.send({
                    status: "failure",
                    error: "The database encountered an error",
                    rawError: err
                });
                return;
            }
        });
    });
    app.get("/schedule/:id", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        var presentationID = request.params.id;

        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            if (!presentation) {
                response.redirect("/schedule");
                return;
            }
            var startTime;
            var endTime;
            for (var i = 0; i < Schedule.length; i++) {
                if (Schedule[i].sessionNumber === presentation.sessionNumber) {
                    startTime = getTime(Schedule[i].start);
                    endTime = getTime(Schedule[i].end);
                    break;
                }
            }
            var isPresenter = false;
            if (loggedIn) {
                var username = email.match(/^([a-z]{3,}\d?)(@gfacademy.org)?$/i)[1];
                if (username === presentation.presenterUsername || admin) {
                    isPresenter = true;
                }
            }
            response.render("presentation", { title: "View Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin, fromAdmin: false, fromSchedule: true, presentation: presentation, startTime: startTime, endTime: endTime, isPresenter: isPresenter }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });

    app.post("/checkin", function (request, response) {
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        if (!loggedIn) {
            response.send({
                "status": "failure",
                "info": "You must be logged in to check in"
            });
            return;
        }

        var code = request.body.code;
        var id = request.body.id;

        Collections.Presentations.findOne({ "sessionID": id, "attendanceCode": code }, function (err, presentation) {
            if (err) {
                console.error(err);
                response.send({
                    "status": "failure",
                    "info": "The database encountered an error",
                    "err": err
                });
                return;
            }
            if (!presentation) {
                response.send({
                    "status": "failure",
                    "info": "Invalid code"
                });
                return;
            }
            Collections.Users.update({ "email": email, "userInfo.Attendance.sessionNumber": presentation.sessionNumber }, { $set: { "userInfo.Attendance.$.present": true } }, { w: 1 }, function (err) {
                if (err) {
                    console.error(err);
                    response.send({
                        "status": "failure",
                        "info": "The database encountered an error",
                        "err": err
                    });
                    return;
                }
                response.send({
                    "status": "success"
                });
            });
        });
    });

    app.get("/login", function (request, response) {
        var code = request.query.code;
        var username = request.query.username;
        Collections.Users.findOne({ username: username, code: code }, function (err, user) {
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
            Collections.Users.update({ username: username }, { $set: { code: "" } }, { "w": 0 }, function () {
            });
            response.json({
                "success": "Logged in successfully"
            });
        });
    });
    app.get("/logout", function (request, response) {
        request.session["email"] = undefined;
        response.json({
            "success": "Logged out successfully"
        });
    });
    app.post("/login", function (request, response) {
        var username = request.body.username;
        if (!username) {
            response.json({
                "error": "FirstClass username not provided"
            });
            return;
        }
        var email = username + "@gfacademy.org";
        createNonce(function (code) {
            var smtpTransport = nodemailer.createTransport("SMTP", {
                service: "Gmail",
                auth: {
                    user: "worldperspectivesprogram@gmail.com",
                    pass: "dragon14"
                }
            });
            var mailOptions = {
                from: "World Perspectives Program <worldperspectivesprogram@gmail.com>",
                to: email,
                subject: "Login Code",
                text: "Your login code is:\n\n" + code,
                html: "<h4>Your login code is:</h4><span>" + code + "</span>"
            };
            smtpTransport.sendMail(mailOptions, function (err, emailResponse) {
                if (err) {
                    console.log(err);
                    response.json({
                        "error": "Email failed to send",
                        "info": err
                    });
                    return;
                }
                Collections.Users.findOne({ username: username }, function (err, previousUser) {
                    if (previousUser) {
                        Collections.Users.update({ username: username }, { $set: { code: code } }, { w: 1 }, function (err) {
                            if (err) {
                                response.json({
                                    "error": "The database encountered an error",
                                    "info": err
                                });
                                return;
                            }
                        });
                    } else {
                        var user = new Student(username, email);
                        Collections.Users.insert({
                            "username": username,
                            "email": email,
                            "code": code,
                            "userInfo": user.exportUser()
                        }, { w: 1 }, function (err) {
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
    app.get("/feedback", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);

        response.render("feedback", {
            title: "Feedback",
            mobileOS: platform,
            loggedIn: loggedIn,
            email: email,
            admin: admin
        }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
        });
    });
    app.post("/feedback", function (request, response) {
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        if (!loggedIn) {
            response.send({
                "status": "failure",
                "info": "You are not logged in"
            });
            return;
        }
        var fields = JSON.parse(request.body.fields);
        for (var i = 0; i < fields.length; i++) {
            try  {
                fields[i] = fields[i].trim();
            } catch (e) {
            }
        }
        if (fields.indexOf("") != -1) {
            response.send({
                "status": "failure",
                "info": "All fields must be filled out"
            });
            return;
        }
        var questionsAndAnswers = {
            "health": fields[0],
            "globalization": fields[1],
            "science": fields[2],
            "incentives": fields[3],
            "positiveExperience": fields[4],
            "connections": fields[5],
            "improvements": fields[6]
        };
        async.waterfall([
            function (callback) {
                Collections.Users.findOne({ email: email }, function (err, user) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    if (!user) {
                        callback(new Error("Invalid user email"));
                        return;
                    }
                    if (user.userInfo.SubmittedFeedback) {
                        response.send({
                            "status": "failure",
                            "info": "You've already submitted feedback"
                        });
                        return;
                    }
                });
            },
            function (user, callback) {
                Collections.Feedback.insert({
                    username: user.username,
                    feedback: questionsAndAnswers
                }, { w: 1 }, callback);
            },
            function (callback) {
                Collections.Users.update({ email: email }, { $set: { "userInfo.SubmittedFeedback": true } }, { w: 1 }, callback);
            }
        ], function (err) {
            if (err) {
                console.error(err);
                response.send({
                    "status": "failure",
                    "info": "A database error occured",
                    "err": err
                });
                return;
            }
            response.send({
                "status": "success"
            });
        });
    });

    // Register for sessions
    app.get("/register", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);

        if (!loggedIn) {
            response.render("register", {
                title: "Register",
                mobileOS: platform,
                loggedIn: loggedIn,
                email: email,
                admin: admin
            }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
            return;
        }

        Collections.Users.findOne({ "email": email }, function (err, user) {
            if (!user)
                return response.send("User not found");

            var registered = user.userInfo.RegisteredForSessions;
            response.render("register", {
                title: "Register",
                mobileOS: platform,
                loggedIn: loggedIn,
                email: email,
                admin: admin,
                registered: registered
            }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });

    // Register a user's preferences
    app.post("/register", function (request, response) {
        var email = request.session["email"];
        if (!email) {
            response.send({
                status: "failure",
                error: "You are not logged in"
            });
            return;
        }
        var preferences = [];
        var data = JSON.parse(request.body.payload);

        for (var i = 1; i <= 4; i++) {
            var preference = {
                sessionNumber: i,
                firstChoice: undefined,
                secondChoice: undefined,
                thirdChoice: undefined
            };
            preference.firstChoice = data["Session " + i][1];
            preference.secondChoice = data["Session " + i][2];
            preference.thirdChoice = data["Session " + i][3];
            preferences.push(preference);
        }
        var receivedPresentations = [];
        async.parallel([
            function (callback) {
                // Insert the user's preferences into the DB
                Collections.Users.update({ "email": email }, { $set: { "userInfo.SessionChoices": preferences, "userInfo.RegisteredForSessions": true } }, { w: 1 }, callback);
            },
            function (callback) {
                // Sort the user into sessions based on their preferences
                async.eachSeries(preferences, function (preference, callback2) {
                    var choices = [];
                    choices.push(preference.firstChoice);
                    choices.push(preference.secondChoice);
                    choices.push(preference.thirdChoice);
                    async.mapSeries(choices, function (choiceID, callback3) {
                        Collections.Presentations.findOne({ "sessionNumber": preference.sessionNumber, sessionID: choiceID }, function (err, presentation) {
                            if (!presentation) {
                                callback3(new Error("Could not find presentation"));
                                return;
                            }
                            callback3(null, presentation);
                        });
                    }, function (err, presentations) {
                        if (err) {
                            callback2(err);
                            return;
                        }
                        function registerForSession(preferenceID) {
                            var studentName;
                            async.waterfall([
                                function (callback4) {
                                    Collections.Names.findOne({ "email": email }, function (err, student) {
                                        if (err)
                                            callback4(err);
                                        else
                                            callback4(null, student.name);
                                    });
                                },
                                function (studentName, callback4) {
                                    Collections.Presentations.update({ "sessionID": preferenceID }, { $push: { attendees: studentName } }, { w: 1 }, function (err) {
                                        if (err) {
                                            callback4(err);
                                            return;
                                        }
                                        Collections.Users.update({ "email": email }, { $push: { "userInfo.Sessions": preferenceID } }, { w: 1 }, function (err) {
                                            callback4(err);
                                        });
                                    });
                                },
                                function (callback4) {
                                    Collections.Presentations.findOne({ "sessionID": preferenceID }, function (err, presentation) {
                                        // If there's an error, presentation will be null therefore preserving the order of the array. Otherwise, err is null anyway
                                        receivedPresentations.push(presentation);
                                        callback4(err);
                                    });
                                }
                            ], callback2);
                        }

                        var presentation1Attendees = presentations[0].attendees.length;
                        var presentation1Capacity = presentations[0].location.capacity;
                        var presentation2Attendees = presentations[1].attendees.length;
                        var presentation2Capacity = presentations[1].location.capacity;
                        var presentation3Attendees = presentations[2].attendees.length;
                        var presentation3Capacity = presentations[2].location.capacity;

                        if (presentation1Attendees < (presentation1Capacity / 2)) {
                            // Less than minimum capacity so place them in their first choice
                            registerForSession(preference.firstChoice);
                        } else if (presentation2Attendees < (presentation2Capacity / 2)) {
                            // Their first choice is above minimum and their second isn't above minimum
                            registerForSession(preference.secondChoice);
                        } else if (presentation3Attendees < (presentation3Capacity / 2)) {
                            // Their first and second choices are above minimum and their third isn't
                            registerForSession(preference.thirdChoice);
                        } else if (presentation1Attendees < presentation1Capacity) {
                            // Their first choice isn't above capacity yet
                            registerForSession(preference.firstChoice);
                        } else if (presentation2Attendees < presentation2Capacity) {
                            // Their second choice isn't above capacity yet
                            registerForSession(preference.secondChoice);
                        } else if (presentation3Attendees < presentation3Capacity) {
                            // Their third choice isn't above capacity yet
                            registerForSession(preference.thirdChoice);
                        } else {
                            callback2(new Error("All presentations are full or an error occured grouping you into presentations"));
                        }
                    });
                }, callback);
            }
        ], function (err) {
            if (err) {
                console.error(err);
                response.send({
                    status: "failure",
                    error: "The database encountered an error",
                    rawError: err
                });
                return;
            }

            response.send({
                status: "success",
                receivedPresentations: receivedPresentations
            });
        });
    });

    app.get("/register/:sessionNumber", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);

        var sessionNumber = parseInt(request.params.sessionNumber, 10);
        if (isNaN(sessionNumber)) {
            response.redirect("/register");
            return;
        }
        Collections.Presentations.find({ "sessionNumber": sessionNumber }, { sort: "presenter" }).toArray(function (err, presentations) {
            var presenterNames = [];
            for (var i = 0; i < presentations.length; i++) {
                presenterNames.push(presentations[i].presenter);
            }
            var pictures = {};

            // Max concurrent requests is 10
            async.eachLimit(presenterNames, 10, function (presenter, callback) {
                Collections.Pictures.findOne({ "name": presenter }, function (err, presenterMedia) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    if (!presenterMedia) {
                        callback();
                        return;
                    }
                    pictures[presenter] = presenterMedia.picture;
                    callback();
                });
            }, function (err) {
                if (err) {
                    response.set("Content-Type", "text/plain");
                    response.send(500, "A database error occured\n\n" + JSON.stringify(err));
                    return;
                }
                response.render("register", {
                    title: "Session " + sessionNumber.toString(),
                    mobileOS: platform,
                    loggedIn: loggedIn,
                    email: email,
                    admin: admin,
                    sessionNumber: sessionNumber,
                    presentations: presentations,
                    pictures: pictures
                }, function (err, html) {
                    if (err)
                        console.error(err);
                    response.send(html);
                });
            });
        });
    });
    app.get("/register/:sessionNumber/:id", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        var presentationID = request.params.id;
        var sessionNumber = parseInt(request.params.sessionNumber, 10);
        if (isNaN(sessionNumber)) {
            response.redirect("/register");
            return;
        }

        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            if (!presentation) {
                response.redirect("/register");
                return;
            }
            var startTime;
            var endTime;
            for (var i = 0; i < Schedule.length; i++) {
                if (Schedule[i].sessionNumber === presentation.sessionNumber) {
                    startTime = getTime(Schedule[i].start);
                    endTime = getTime(Schedule[i].end);
                    break;
                }
            }
            response.render("presentation", { title: "View Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin, fromAdmin: false, fromRegister: true, sessionNumber: sessionNumber, presentation: presentation, startTime: startTime, endTime: endTime }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });

    // Admin pages
    function AdminAuth(request, response, next) {
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        if (!loggedIn || adminEmails.indexOf(email) == -1) {
            console.warn("/admin request rejected. Email: " + email + ", loggedIn: " + loggedIn);
            response.redirect("/");
            return;
        }
        next();
    }
    app.get("/admin", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        response.render("admin", { title: "Admin", mobileOS: platform, loggedIn: loggedIn, email: email }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
        });
    });
    app.get("/admin/attendance", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];

        var userStream = Collections.Users.find({ "userInfo.Admin": false, "userInfo.Presenter": false }).stream();
        var attendance = {
            "1": {
                "present": [],
                "absent": []
            },
            "2": {
                "present": [],
                "absent": []
            },
            "3": {
                "present": [],
                "absent": []
            },
            "4": {
                "present": [],
                "absent": []
            }
        };
        userStream.on("data", function (user) {
            if (user.userInfo.Attendance[0].present)
                attendance[1].present.push(user.username);
            else
                attendance[1].absent.push(user.username);
            if (user.userInfo.Attendance[1].present)
                attendance[2].present.push(user.username);
            else
                attendance[2].absent.push(user.username);
            if (user.userInfo.Attendance[2].present)
                attendance[3].present.push(user.username);
            else
                attendance[3].absent.push(user.username);
            if (user.userInfo.Attendance[3].present)
                attendance[4].present.push(user.username);
            else
                attendance[4].absent.push(user.username);
        });
        userStream.on("end", function () {
            response.render("admin/attendance", { title: "Attendance", mobileOS: platform, loggedIn: loggedIn, email: email, attendance: attendance }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
    app.get("/admin/attendance/:sessionNumber", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var sessionNumber = parseInt(request.params["sessionNumber"], 10);
        if (isNaN(sessionNumber)) {
            response.redirect("/admin/attendance");
            return;
        }

        // List every presentation in that session with a list of absent people and present people
        // Presentations -> Attendees -> db.names -> db.users
        var attendance = {};
        Collections.Presentations.find({ sessionNumber: sessionNumber }).toArray(function (err, presentations) {
            async.each(presentations, function (presentation, callback) {
                Collections.Names.find({ "name": { $in: presentation.attendees } }).toArray(function (err, attendees) {
                    async.each(attendees, function (attendee, callback2) {
                        Collections.Users.findOne({ username: attendee.username }, function (err, user) {
                            if (!user) {
                                callback2(err);
                            }
                            if (!attendance[presentation.sessionID])
                                attendance[presentation.sessionID] = { present: [], absent: [], presentation: presentation };
                            if (user.userInfo.Attendance[sessionNumber - 1].present)
                                attendance[presentation.sessionID].present.push(attendee.name);
                            else
                                attendance[presentation.sessionID].absent.push(attendee.name);
                            callback2(err);
                        });
                    }, function (err) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        attendance[presentation.sessionID].present.sort(function (a, b) {
                            if (a.split(" ")[1] < b.split(" ")[1])
                                return -1;
                            if (a.split(" ")[1] > b.split(" ")[1])
                                return 1;
                            return 0;
                        });
                        attendance[presentation.sessionID].absent.sort(function (a, b) {
                            if (a.split(" ")[1] < b.split(" ")[1])
                                return -1;
                            if (a.split(" ")[1] > b.split(" ")[1])
                                return 1;
                            return 0;
                        });
                        callback();
                    });
                });
            }, function (err) {
                if (err) {
                    console.error(err);
                    response.send("An error occured");
                    return;
                }

                // Organize by presentation title
                var attendanceArray = [];
                for (var sessionID in attendance) {
                    attendanceArray.push(attendance[sessionID]);
                }
                attendanceArray.sort(function (a, b) {
                    if (a.presentation.presenter.split(" ")[1] < b.presentation.presenter.split(" ")[1])
                        return -1;
                    if (a.presentation.presenter.split(" ")[1] > b.presentation.presenter.split(" ")[1])
                        return 1;
                    return 0;
                });
                response.render("admin/attendance", { title: "Attendance Session " + sessionNumber, mobileOS: platform, loggedIn: loggedIn, email: email, sessionNumber: sessionNumber, attendance: attendanceArray }, function (err, html) {
                    if (err)
                        console.error(err);
                    response.send(html);
                });
            });
        });
    });
    app.post("/admin/attendance/markpresent", AdminAuth, function (request, response) {
        var name = request.body.name;
        var sessionNumber = parseInt(request.body.sessionNumber, 10);
        Collections.Names.findOne({ "name": name }, function (err, userMetaData) {
            if (err) {
                console.error(err);
                response.send({
                    "status": "failure",
                    "info": "The database encountered an error",
                    err: err
                });
                return;
            }
            if (!userMetaData) {
                response.send({
                    "status": "failure",
                    "info": "Name not found"
                });
                return;
            }
            Collections.Users.update({ username: userMetaData.username, "userInfo.Attendance.sessionNumber": sessionNumber }, { $set: { "userInfo.Attendance.$.present": true } }, { w: 1 }, function (err) {
                if (err) {
                    console.error(err);
                    response.send({
                        "status": "failure",
                        "info": "The database encountered an error",
                        "err": err
                    });
                    return;
                }
                response.send({
                    "status": "success"
                });
            });
        });
    });

    app.get("/admin/presentations", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];

        Collections.Presentations.find({}, { sort: "presenter" }).toArray(function (err, presentations) {
            response.render("admin/sessions", { title: "Presentations", mobileOS: platform, loggedIn: loggedIn, email: email, presentations: presentations }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
    app.get("/admin/presentations/edit/:id", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var presentationID = request.params.id;
        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            if (!presentation) {
                response.redirect("/admin/presentations");
                return;
            }
            response.render("admin/presentation", { title: "Edit Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, fromAdmin: true, presentation: presentation }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
    app.post("/admin/presentations/edit/:id", AdminAuth, function (request, response) {
        var presentationID = request.params.id;
        var data = {
            "presenter": request.body.name || "",
            "title": request.body.title || "",
            "abstract": request.body.abstract || "",
            "sessionNumber": parseInt(request.body.session, 10),
            "location.name": request.body.location || "",
            "location.capacity": parseInt(request.body.locationCapacity, 10)
        };
        if (request.body.uploadedPDF)
            data.pdfID = request.body.uploadedPDF;
        if (request.body.youtubeID)
            data["media.mainVideo"] = request.body.youtubeID;

        var mediaIDs = [];
        try  {
            if (request.body.uploadedMedia)
                mediaIDs = JSON.parse(request.body.uploadedMedia);
        } catch (e) {
            response.send({
                "status": "failure",
                "reason": "Invalid JSON"
            });
            return;
        }
        if (isNaN(data.sessionNumber) || isNaN(data["location.capacity"]) || data.presenter === "" || data.title === "" || data.abstract === "") {
            response.send({
                "status": "failure",
                "reason": "Invalid information"
            });
            return;
        }
        async.parallel([
            function (callback) {
                Collections.Presentations.update({ "sessionID": presentationID }, { $set: data }, { w: 1 }, callback);
            },
            function (callback) {
                var imageType = /image.*/;
                var images = [];
                for (var i = 0; i < mediaIDs.length; i++) {
                    var file = mediaIDs[i];
                    var mimeType = mime.lookup(file);
                    var image = !!mimeType.match(imageType);
                    if (image) {
                        images.push(file);
                    }
                }
                Collections.Presentations.update({ "sessionID": presentationID }, { $push: { "media.images": { $each: images } } }, { w: 1 }, callback);
            }
        ], function (err) {
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
    app.delete("/admin/presentations/edit/:id", AdminAuth, function (request, response) {
        var id = request.params.id;
        Collections.Presentations.findOne({ "sessionID": id }, function (err, presentation) {
            // Delete that presentation's media
            var media = [];
            media = media.concat(presentation.media.images);
            media = media.concat(presentation.media.videos);

            for (var i = 0; i < media.length; i++) {
                media[i] = __dirname + "/media/" + media[i];
            }
            async.parallel([
                function (callback) {
                    async.each(media, fs.unlink, callback);
                },
                function (callback) {
                    // Remove the presentation from the DB
                    Collections.Presentations.remove({ "sessionID": id }, { w: 1 }, callback);
                }
            ], function (err) {
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
    app.get("/admin/presentations/view/:id", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var presentationID = request.params.id;

        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            if (!presentation) {
                response.redirect("/admin/presentations");
                return;
            }
            var startTime;
            var endTime;
            for (var i = 0; i < Schedule.length; i++) {
                if (Schedule[i].sessionNumber === presentation.sessionNumber) {
                    startTime = getTime(Schedule[i].start);
                    endTime = getTime(Schedule[i].end);
                    break;
                }
            }
            response.render("presentation", { title: "View Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, fromAdmin: true, presentation: presentation, startTime: startTime, endTime: endTime }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
    app.get("/admin/presentations/code", AdminAuth, function (request, response) {
        var id = request.query.id;
        Collections.Presentations.findOne({ "sessionID": id }, function (err, presentation) {
            if (!presentation) {
                response.send({
                    "status": "error",
                    "reason": "Presentation ID invalid or missing"
                });
                return;
            }
            var code = crypto.randomBytes(3);
            var attendanceCode = parseInt(code.toString("hex"), 16).toString().substr(0, 6);
            Collections.Presentations.update({ "sessionID": id }, { $set: { attendanceCode: attendanceCode } }, { w: 1 }, function (err) {
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
    app.post("/admin/presentations", AdminAuth, function (request, response) {
        var data = {
            "name": request.body.name || "",
            "title": request.body.title || "",
            "youtubeID": request.body.youtubeID || undefined,
            "uploadedMedia": [],
            "uploadedPDF": request.body.uploadedPDF || undefined,
            "abstract": request.body.abstract || "",
            "session": parseInt(request.body.session, 10),
            "location": request.body.location || "",
            "locationCapacity": parseInt(request.body.locationCapacity, 10)
        };
        try  {
            if (request.body.uploadedMedia)
                data.uploadedMedia = JSON.parse(request.body.uploadedMedia);
        } catch (e) {
            response.send({
                "status": "failure",
                "reason": "Invalid JSON"
            });
            return;
        }
        if (isNaN(data.session) || isNaN(data.locationCapacity) || data.name === "" || data.title === "" || data.abstract === "") {
            response.send({
                "status": "failure",
                "reason": "Invalid information"
            });
            return;
        }
        var presentation = {
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
            location: {
                name: data.location,
                capacity: data.locationCapacity
            },
            attendees: [],
            pdfID: data.uploadedPDF,
            abstract: data.abstract
        };
        var imageType = /image.*/;
        var videoType = /video.*/;
        for (var i = 0; i < data.uploadedMedia.length; i++) {
            var file = data.uploadedMedia[i];
            var mimeType = mime.lookup(file);
            var image = !!mimeType.match(imageType);
            var video = !!mimeType.match(videoType);
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
        var code = crypto.randomBytes(3);
        presentation.attendanceCode = parseInt(code.toString("hex"), 16).toString().substr(0, 6);

        // Retrieve the presenter (or create them if they don't exist in the DB)
        // TODO: name -> email conversion
        Collections.Presentations.insert(presentation, { w: 1 }, function (err) {
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
    app.post("/admin/presentations/media", AdminAuth, function (request, response) {
        if (request.body.type == "pdf") {
            // PDF upload
            var pdf = request.files["pdf"];
            if (pdf.type != "application/pdf") {
                fs.unlink(pdf.path, function (err) {
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
            } else {
                console.log("Valid file with MIME type: " + pdf.type);
                var id = crypto.randomBytes(16).toString("hex");

                // Move the temp file
                var sourceFile = fs.createReadStream(pdf.path);

                var s3Params = {
                    Bucket: "worldperspectivespdfs",
                    Key: id,
                    ACL: "public-read",
                    Body: sourceFile,
                    ContentType: pdf.type
                };
                s3.putObject(s3Params, function (err, data) {
                    if (err) {
                        // Delete the temp files
                        // Who cares if these return errors
                        fs.unlink(pdf.path);
                        console.error(err);
                        response.send({
                            "status": "error",
                            "reason": err
                        });
                        return;
                    }

                    // Delete the temp file
                    fs.unlink(pdf.path, function (err) {
                        if (err) {
                            console.error(err);
                            response.send({
                                "status": "error",
                                "reason": err
                            });
                            return;
                        }
                        response.send({
                            "status": "success",
                            "id": id
                        });
                    });
                });
            }
        } else {
            // Media upload
            var key;
            var files = [];
            var urls = [];
            var ids = [];
            for (key in request.files) {
                var file = request.files[key];
                files.push(file);
            }
            async.eachSeries(files, function (file, callback) {
                if (file.type.indexOf("image/") == -1 && file.type.indexOf("video/") == -1) {
                    fs.unlink(file.path, function (err) {
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
                var id = crypto.randomBytes(16).toString("hex");

                // Move the temp file
                var sourceFile = fs.createReadStream(file.path);
                var newFileName = "/media/" + id + path.extname(file.path);
                var destFile = fs.createWriteStream(__dirname + newFileName);
                sourceFile.pipe(destFile);
                sourceFile.on("end", function () {
                    // Delete the temp file
                    fs.unlink(file.path, function (err) {
                        if (err) {
                            console.error(err);
                            callback(err);
                            return;
                        }
                        urls.push(newFileName);
                        ids.push(id + path.extname(file.path));

                        // Auto rotate and orient the image
                        gm(__dirname + newFileName).autoOrient().write(__dirname + newFileName, function (err) {
                            if (err) {
                                console.error(err);
                                callback(err);
                                return;
                            }
                            callback();
                        });
                    });
                });
                sourceFile.on("error", function (err) {
                    // Delete the temp files
                    // Who cares if these return errors
                    fs.unlink(file.path);
                    fs.unlink(__dirname + newFileName);
                    callback(err);
                });
            }, function (err) {
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
    app.delete("/admin/presentations/media", AdminAuth, function (request, response) {
        var id = request.body.id;
        async.parallel([
            function (callback) {
                Collections.Presentations.update({ "media.images": id }, { $pull: { "media.images": id } }, { w: 1 }, function (err) {
                    callback(err);
                });
            },
            function (callback) {
                fs.unlink(__dirname + "/media/" + id, function (err) {
                    callback(err);
                });
            }
        ], function (err) {
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

    app.get("/admin/registrations", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];

        var referrerID = request.get("referrer");
        referrerID = path.basename(referrerID);

        async.parallel([
            function (callback) {
                Collections.Presentations.find({}, { sort: "presenter" }).toArray(callback);
            },
            function (callback) {
                Collections.Users.find({ "userInfo.RegisteredForSessions": true }, { username: 1, _id: 0 }).toArray(function (err, users) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    for (var i = 0; i < users.length; i++) {
                        users[i] = users[i].username;
                    }
                    Collections.Names.find({ username: { $nin: users } }).toArray(callback);
                });
            },
            function (callback) {
                Collections.Presentations.findOne({ sessionID: referrerID }, callback);
            }
        ], function (err, results) {
            var presentations = results[0];
            var unregisteredStudents = results[1];
            var referringPresentation = results[2];

            var goToSessionTab = 1;
            if (referringPresentation)
                goToSessionTab = referringPresentation.sessionNumber;

            response.render("admin/registrations", { title: "Registrations", mobileOS: platform, loggedIn: loggedIn, email: email, presentations: presentations, unregisteredStudents: unregisteredStudents, goToSessionTab: goToSessionTab }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
    app.get("/admin/registrations/:id", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        var presentationID = request.params.id;

        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            if (!presentation) {
                response.redirect("/admin/registrations");
                return;
            }
            var startTime;
            var endTime;
            for (var i = 0; i < Schedule.length; i++) {
                if (Schedule[i].sessionNumber === presentation.sessionNumber) {
                    startTime = getTime(Schedule[i].start);
                    endTime = getTime(Schedule[i].end);
                    break;
                }
            }
            async.map(presentation.attendees, function (attendee, callback) {
                Collections.Names.findOne({ "name": attendee }, function (err, user) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    if (!user) {
                        callback(new Error("User not defined: '" + attendee + "'"));
                        return;
                    }
                    Collections.Users.findOne({ "username": user.username }, function (err, user) {
                        if (err) {
                            callback(err);
                            return;
                        }
                        if (!user) {
                            callback(new Error("User not defined: '" + user.username + "'"));
                            return;
                        }
                        callback(null, user);
                    });
                });
            }, function (err, attendees) {
                if (err) {
                    console.error(err);
                    response.send("An error occurred:<br>" + JSON.stringify(err));
                    return;
                }
                response.render("admin/registration_detail", { title: "Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, presentation: presentation, attendees: attendees, startTime: startTime, endTime: endTime }, function (err, html) {
                    if (err)
                        console.error(err);
                    response.send(html);
                });
            });
        });
    });

    // Print session lists
    app.get("/admin/registrations/print/:sessionNumber", AdminAuth, function (request, response) {
        var sessionNumber = parseInt(request.params.sessionNumber, 10);
        if (!(sessionNumber <= 4 && sessionNumber >= 1)) {
            response.send("Invalid session");
            return;
        }
        async.parallel([
            function (callback) {
                Collections.Presentations.find({ "sessionNumber": sessionNumber }, { sort: "presenter" }).toArray(callback);
            },
            function (callback) {
                Collections.Names.find().toArray(callback);
            }
        ], function (err, results) {
            response.render("admin/attendees_print", {
                title: "Session " + sessionNumber,
                sessionNumber: sessionNumber,
                presentations: results[0],
                names: results[1]
            }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });

    // Auto register unregistered students
    app.post("/admin/registrations/auto", AdminAuth, function (request, response) {
        async.waterfall([
            function (callback) {
                Collections.Users.find({ "userInfo.RegisteredForSessions": true }, { username: 1, _id: 0 }).toArray(callback);
            },
            function (users, callback) {
                for (var i = 0; i < users.length; i++) {
                    users[i] = users[i].username;
                }
                Collections.Names.find({ username: { $nin: users } }).toArray(callback);
            },
            function (unregisteredStudents, callback) {
                Collections.Presentations.find({}).toArray(function (err, presentations) {
                    // err should be null if there isn't an error
                    callback(err, unregisteredStudents, presentations);
                });
            },
            function (unregisteredStudents, presentations, callback) {
                for (var i = unregisteredStudents.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var temp = unregisteredStudents[i];
                    unregisteredStudents[i] = unregisteredStudents[j];
                    unregisteredStudents[j] = temp;
                }

                // Register each student
                var presentationIndex = 0;
                async.eachSeries(unregisteredStudents, function (unregisteredStudent, callback2) {
                    var username = unregisteredStudent.username;
                    var email = unregisteredStudent.email;
                    var user = new Student(username, email);
                    user.RegisteredForSessions = true;
                    async.eachSeries([1, 2, 3, 4], function (sessionNumber, callback3) {
                        async.waterfall([
                            function (callback4) {
                                Collections.Presentations.find({ $where: "this.attendees.length < this.location.capacity", "sessionNumber": sessionNumber }).toArray(callback4);
                            },
                            function (openPresentations, callback4) {
                                if (openPresentations.length === 0) {
                                    callback4(new Error("Not enough room in session " + sessionNumber));
                                    return;
                                }
                                var presentationToEnter = openPresentations[Math.floor(Math.random() * openPresentations.length)];
                                user.Sessions[sessionNumber - 1] = presentationToEnter.sessionID;
                                Collections.Names.findOne({ "username": username }, function (err, name) {
                                    callback4(err, presentationToEnter, name.name);
                                });
                            },
                            function (presentationToEnter, name, callback4) {
                                Collections.Presentations.update({ "sessionID": presentationToEnter.sessionID }, { $push: { attendees: name } }, { w: 1 }, callback4);
                            }
                        ], callback3);
                    }, function (err) {
                        if (err) {
                            callback2(err);
                            return;
                        }
                        var userData = user.exportUser();
                        Collections.Names.findOne({ username: username }, function (err, userMetaData) {
                            if (err) {
                                callback2(err);
                                return;
                            }
                            userData.Teacher = userMetaData.teacher;
                            Collections.Users.remove({ username: username }, { w: 1 }, function () {
                                Collections.Users.insert({
                                    "username": username,
                                    "email": email,
                                    "code": "",
                                    "autoRegistered": true,
                                    "userInfo": userData
                                }, { w: 1 }, callback2);
                            });
                        });
                    });
                }, callback);
            }
        ], function (err) {
            if (err) {
                console.error(err);
                response.send({
                    "status": "failure",
                    "info": err
                });
                return;
            }
            response.send({
                "status": "success"
            });
        });
    });
    app.get("/admin/registrations/info/:id", AdminAuth, function (request, response) {
        var id = request.params.id;
        Collections.Presentations.findOne({ "sessionID": id }, function (err, presentation) {
            if (err) {
                console.error(err);
                response.send({
                    "status": "failure",
                    "info": err
                });
                return;
            }
            if (!presentation) {
                response.send({
                    "status": "failure",
                    "info": "No presentation found"
                });
                return;
            }
            Collections.Presentations.find({ "sessionNumber": presentation.sessionNumber, "sessionID": { $ne: id } }, { sort: "title" }).toArray(function (err, otherPresentations) {
                if (err) {
                    console.error(err);
                    response.send({
                        "status": "failure",
                        "info": err
                    });
                    return;
                }
                response.send({
                    "status": "success",
                    "presentations": otherPresentations
                });
            });
        });
    });

    // Move a student
    app.post("/admin/registrations/move", AdminAuth, function (request, response) {
        var name = request.body.name;
        var newPresentation = request.body.moveToID;
        var currentPresentation = request.body.currentID;
        async.waterfall([
            function (callback) {
                Collections.Names.findOne({ name: name }, callback);
            },
            function (userData, callback) {
                if (!userData) {
                    callback(new Error("User not found"));
                    return;
                }
                async.parallel([
                    function (callback2) {
                        // Update the first presentation
                        Collections.Presentations.update({ sessionID: currentPresentation }, { $pull: { attendees: name } }, { w: 1 }, callback2);
                    },
                    function (callback2) {
                        // Update the second presentation
                        Collections.Presentations.update({ sessionID: newPresentation }, { $push: { attendees: name } }, { w: 1 }, callback2);
                    },
                    function (callback2) {
                        // Update the user's presentations
                        Collections.Users.update({ username: userData.username, "userInfo.Sessions": currentPresentation }, { $set: { "userInfo.Sessions.$": newPresentation } }, { w: 1 }, callback2);
                    }
                ], callback);
            }
        ], function (err) {
            if (err) {
                console.error(err);
                response.send({
                    "status": "failure",
                    "info": err
                });
                return;
            }
            response.send({
                "status": "success"
            });
        });
    });

    app.get("/admin/schedule", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        Collections.Names.find().toArray(function (err, names) {
            if (err) {
                console.error(err);
                response.send({
                    status: "failure",
                    error: "The database encountered an error"
                });
                return;
            }
            names.sort(function (a, b) {
                if (a.name.split(" ")[1] < b.name.split(" ")[1])
                    return -1;
                if (a.name.split(" ")[1] > b.name.split(" ")[1])
                    return 1;
                return 0;
            });
            response.render("admin/schedule_list", { title: "Schedules", mobileOS: platform, loggedIn: loggedIn, email: email, names: names }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });

    app.get("/admin/schedule/:username", AdminAuth, function (request, response) {
        var username = request.params.username;
        var scheduleForJade = [];
        for (var i = 0, len = Schedule.length; i < len; i++) {
            var scheduleItem = {
                title: Schedule[i].title,
                start: getTime(Schedule[i].start),
                end: getTime(Schedule[i].end)
            };
            scheduleForJade.push(scheduleItem);
        }

        async.waterfall([
            function (callback) {
                Collections.Users.findOne({ username: username }, callback);
            },
            function (user, callback) {
                if (!user) {
                    callback(new Error("Could not find requested student"));
                    return;
                }
                async.map(user.userInfo.Sessions, function (sessionItemID, callbackMap) {
                    Collections.Presentations.findOne({ "sessionID": sessionItemID }, callbackMap);
                }, callback);
            }
        ], function (err, presentations) {
            if (err) {
                console.error(err);
                response.send({
                    status: "failure",
                    error: "The database encountered an error",
                    rawError: err
                });
                return;
            }
            Collections.Names.findOne({ username: username }, function (err, userMetaData) {
                response.render("admin/schedule", {
                    title: "Schedule",
                    renderSchedule: scheduleForJade,
                    realSchedule: Schedule,
                    presentations: presentations,
                    user: userMetaData
                }, function (err, html) {
                    if (err)
                        console.error(err);
                    response.send(html);
                });
            });
        });
    });

    app.get("/admin/schedule/grade/:grade", AdminAuth, function (request, response) {
        var grade = 0;
        var teachers = false;
        if (request.params.grade === "faculty")
            teachers = true;
        else
            grade = parseInt(request.params.grade, 10);

        var scheduleForJade = [];
        for (var i = 0, len = Schedule.length; i < len; i++) {
            var scheduleItem = {
                title: Schedule[i].title,
                start: getTime(Schedule[i].start),
                end: getTime(Schedule[i].end)
            };
            scheduleForJade.push(scheduleItem);
        }

        if (teachers)
            var searchQuery = { "teacher": true };
        else
            var searchQuery = { "grade": grade };
        Collections.Names.find(searchQuery).toArray(function (err, peopleInClass) {
            if (!peopleInClass) {
                response.send("Not valid class number");
                return;
            }
            peopleInClass.sort(function (a, b) {
                if (a.name.split(" ")[1] < b.name.split(" ")[1])
                    return -1;
                if (a.name.split(" ")[1] > b.name.split(" ")[1])
                    return 1;
                return 0;
            });
            async.map(peopleInClass, function (userMetaData, callbackMap) {
                async.waterfall([
                    function (callback) {
                        Collections.Users.findOne({ username: userMetaData.username }, callback);
                    },
                    function (user, callback) {
                        if (!user) {
                            callback(new Error("Could not find requested student"));
                            return;
                        }
                        async.map(user.userInfo.Sessions, function (sessionItemID, callbackMap) {
                            Collections.Presentations.findOne({ "sessionID": sessionItemID }, callbackMap);
                        }, callback);
                    }
                ], function (err, presentations) {
                    userMetaData.presentations = presentations;
                    callbackMap(err, userMetaData);
                });
            }, function (err, results) {
                if (err) {
                    console.error(err);
                    response.send({
                        status: "failure",
                        error: "The database encountered an error",
                        rawError: err
                    });
                    return;
                }
                response.render("admin/schedule", {
                    title: "Schedule",
                    renderSchedule: scheduleForJade,
                    realSchedule: Schedule,
                    users: results,
                    multiple: true
                }, function (err, html) {
                    if (err)
                        console.error(err);
                    response.send(html);
                });
            });
        });
    });

    app.get("/admin/feedback", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        response.render("admin/feedback", { title: "Feedback", mobileOS: platform, loggedIn: loggedIn, email: email }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
        });
    });

    // 404 Not Found
    app.use(function (request, response, next) {
        response.render("404", { title: "404 Not Found", url: request.url }, function (err, html) {
            if (err)
                console.error(err);
            response.send(404, html);
        });
    });

    app.listen(PORT, "0.0.0.0", function () {
        console.log("Listening on port " + PORT);
        console.log("Startup time: " + (Date.now() - StartUpTime) + "ms");
    });
}); // End of MongoDB db function
