var PORT = 8080;

var http = require("http");
var crypto = require("crypto");

var express = require("express");
var app = express();

app.use(express.compress());

//app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.urlencoded());
app.use(express.session({
    secret: "5e3e4acccc5de18e9e44c5c34da5da7f658301e35c5da6471b8cee83b855d587"
}));
require("express-persona")(app, {
    audience: "http://localhost:" + PORT
});

app.set("views", __dirname + "/views");
app.set("view engine", "jade");

app.use("/css", express.static("css"));
app.use("/js", express.static("js"));
app.use("/ratchet", express.static("ratchet"));

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

app.get("/", function (request, response) {
    var platform = getPlatform(request);
    var loggedIn = !!request.session["email"];
    var email = request.session["email"];
    response.render("index", { title: "Explore", mobileOS: platform, loggedIn: loggedIn, email: email }, function (err, html) {
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
        response.send(html);
    });
});

app.listen(PORT, "0.0.0.0", function () {
    console.log("Listening on port " + PORT);
});
