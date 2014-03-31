var StartUpTime = Date.now();
var PORT = 8080;

var adminEmails = ["petschekr@gfacademy.org", "beckerju@gfacademy.org", "jmirza@gfacademy.org", "vzonta@gfacademy.org"];

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
MongoClient.connect("mongodb://nodejitsu:9aef9b4317035915c03da290251ad0ad@troup.mongohq.com:10062/nodejitsudb6476468427", function (err, db) {
    if (err)
        throw err;

    var Collections = {
        Users: db.collection("users"),
        Schedule: db.collection("schedule"),
        Presentations: db.collection("presentations")
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

    app.use(function (request, response, next) {
        response.setHeader("Strict-Transport-Security", "max-age=8640000; includeSubDomains");
        if (request.headers["x-forwarded-proto"] !== "https") {
            response.redirect(301, "https://" + request.headers.host + "/");
            return;
        }
        next();
    });

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

    // Register for sessions
    app.get("/register", function (request, response) {
        //request.session["email"] = "petschekr@gfacademy.org";
        var platform = getPlatform(request);
        var loggedIn = !!request.session["email"];
        var email = request.session["email"];
        var admin = !(!loggedIn || adminEmails.indexOf(email) == -1);

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
        Collections.Presentations.find({ "sessionNumber": sessionNumber }).toArray(function (err, presentations) {
            response.render("register", {
                title: "Session " + sessionNumber.toString(),
                mobileOS: platform,
                loggedIn: loggedIn,
                email: email,
                admin: admin,
                sessionNumber: sessionNumber,
                presentations: presentations
            }, function (err, html) {
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

        var userStream = Collections.Users.find({ "Admin": { $ne: true } }).stream();
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
        };
        userStream.on("data", function (user) {
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
        var userStream = Collections.Users.find({ "Admin": { $ne: true } }).stream();
        var attendance = {
            present: [],
            absent: []
        };
        userStream.on("data", function (user) {
            if (user.userInfo.Attendance[sessionNumber - 1].present)
                attendance.present.push(user.username);
            else
                attendance.absent.push(user.username);
        });
        userStream.on("end", function () {
            response.render("admin/attendance", { title: "Attendance Session " + sessionNumber, mobileOS: platform, loggedIn: loggedIn, email: email, sessionNumber: sessionNumber, attendance: attendance }, function (err, html) {
                if (err)
                    console.error(err);
                response.send(html);
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
            "media.mainVideo": request.body.youtubeID || undefined,
            "abstract": request.body.abstract || "",
            "sessionNumber": parseInt(request.body.session, 10)
        };
        if (request.body.uploadedPDF)
            data.pdfID = request.body.uploadedPDF;

        try  {
            if (request.body.uploadedMedia)
                data["media.mainVideo"] = JSON.parse(request.body.uploadedMedia);
        } catch (e) {
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
            function (callback) {
                Collections.Presentations.update({ "sessionID": presentationID }, { $set: data }, { w: 1 }, callback);
            },
            function (callback) {
                var imageType = /image.*/;
                var images = [];
                for (var i = 0; i < data["media.mainVideo"].length; i++) {
                    var file = data["media.mainVideo"][i];
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
            if (presentation.pdfID)
                media.push(presentation.pdfID);
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
            "session": parseInt(request.body.session, 10)
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
        if (isNaN(data.session) || data.name === "" || data.title === "" || data.abstract === "") {
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
                var newFileName = "/media/" + id + path.extname(pdf.path);
                var destFile = fs.createWriteStream(__dirname + newFileName);
                sourceFile.pipe(destFile);
                sourceFile.on("end", function () {
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
                            "id": id + path.extname(pdf.path)
                        });
                    });
                });
                sourceFile.on("error", function (err) {
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
