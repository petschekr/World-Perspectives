var StartUpTime = Date.now();
var PORT = 8080;

var adminEmails = ["petschekr@gfacademy.org", "beckerju@gfacademy.org", "jmirza@gfacademy.org", "vllanque@gfacademy.org"];

var Schedule = [
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
    }
];

var http = require("http");
var crypto = require("crypto");
var fs = require("fs");

var MongoClient = require("mongodb").MongoClient;
MongoClient.connect("mongodb://localhost:27017/wpp", function (err, db) {
    if (err)
        throw err;

    var Collections = {
        Users: db.collection("users")
    };

    var nodemailer = require("nodemailer");
    var express = require("express");
    var app = express();

    app.use(express.compress());
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.session({
        secret: "5e3e4acccc5de18e9e44c5c34da5da7f658301e35c5da6471b8cee83b855d587",
        cookie: {
            path: "/",
            httpOnly: true,
            maxAge: 3600000 * 24 * 7
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
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        response.render("index", { title: "World Perspectives Symposium", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
        });
    });
    app.get("/explore", function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);
        response.render("explore", { title: "Explore", mobileOS: platform, loggedIn: loggedIn, email: email, admin: admin }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
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
        response.render("schedule", {
            title: "My Schedule",
            mobileOS: platform,
            loggedIn: loggedIn,
            email: email,
            admin: admin,
            renderSchedule: scheduleForJade,
            realSchedule: Schedule
        }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
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
                    // Sent from petschekr@gmail.com (Temporary)
                    user: "petschekr@gmail.com",
                    pass: "zvkmegclukmcognx"
                }
            });
            var mailOptions = {
                from: "World Perspectives Program <petschekr@gmail.com>",
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
                        Collections.Users.insert({
                            "username": username,
                            "email": email,
                            "code": code
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
        response.render("admin/attendance", { title: "Attendance", mobileOS: platform, loggedIn: loggedIn, email: email }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
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
        response.render("admin/attendance", { title: "Attendance Session " + sessionNumber, mobileOS: platform, loggedIn: loggedIn, email: email, sessionNumber: sessionNumber }, function (err, html) {
            if (err)
                console.error(err);
            response.send(html);
        });
    });
    app.get("/admin/presentations", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];

        Collections.Presentations.find().toArray(function (err, presentations) {
            response.render("admin/sessions", { title: "Presentations", mobileOS: platform, loggedIn: loggedIn, email: email, presentations: presentations }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
    app.get("/admin/presentations/:id", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var presentationID = request.params.id;

        Collections.Presentations.findOne({ "sessionID": presentationID }, function (err, presentation) {
            var startTime;
            var endTime;
            for (var i = 0; i < Schedule.length; i++) {
                if (Schedule[i].sessionNumber === presentation.sessionNumber) {
                    startTime = getTime(Schedule[i].start);
                    endTime = getTime(Schedule[i].end);
                    break;
                }
            }
            response.render("presentation", { title: "Presentation", mobileOS: platform, loggedIn: loggedIn, email: email, fromAdmin: true, presentation: presentation, startTime: startTime, endTime: endTime }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
            });
        });
    });
                console.error(err);
            response.send(html);
        });
    });

    // Media upload for presentations
    app.post("/admin/presentations/media", AdminAuth, function (request, response) {
        var key;
        for (key in request.files) {
            var file = request.files[key];
            if (file.type.indexOf("image/") == -1 && file.type.indexOf("video/") == -1) {
                fs.unlink(file.path, function (err) {
                    if (err)
                        throw err;
                    console.log("Deleted item with MIME type: " + file.type);
                });
            } else {
                console.log("Valid file with MIME type: " + file.type);
            }

            // Delete the temporary file
            fs.unlink(file.path);
        }
        ;
        response.send({});
    });

    app.get("/admin/feedback", AdminAuth, function (request, response) {
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        response.render("admin/feedback", { title: "Admin", mobileOS: platform, loggedIn: loggedIn, email: email }, function (err, html) {
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
