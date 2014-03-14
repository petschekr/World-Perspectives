$(document).ready(function () {
    if (window.navigator.standalone) {
        if (localStorage.getItem("login-state") == "2") {
            $("#login-1 > input").val(localStorage.getItem("login-username"));
            $("#login-message").text(localStorage.getItem("login-message")).show();
            $("#login-2").show();
            $("#login").addClass("active");
        }
    }
    var processing = false;
    $("#login-1 button").click(function () {
        if (processing)
            return;
        else
            processing = true;
        var username = $("#login-1 > input").val().trim();
        $("#login-1 button").text("Sending code...");
        $("#login-1 button").attr("disabled", "disabled");
        $.ajax({
            type: "POST",
            url: "/login",
            data: { username: username },
            success: function (res, status, xhr) {
                processing = false;
                if (res.success) {
                    $("#login-message").text("Code sent to " + username + "@gfacademy.org").fadeIn();
                    $("#login-2").fadeIn();
                    $("#login-1 button").text("Code sent");

                    // Persist the state in an iOS web app
                    if (window.navigator.standalone) {
                        localStorage.setItem("login-username", username);
                        localStorage.setItem("login-message", $("#login-message").text());
                        localStorage.setItem("login-state", "2");
                    }
                } else {
                    processing = false;
                    alert("There was an error logging you in: " + res.error);
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error logging you in: " + JSON.stringify(err));
            }
        });
    });
    $("#login-2 button").click(function () {
        if (processing)
            return;
        else
            processing = true;
        var username = $("#login-1 > input").val().trim();
        var code = $("#login-2 > input").val().trim();
        $.ajax({
            type: "GET",
            url: "/login",
            data: { code: code, username: username },
            success: function (res, status, xhr) {
                processing = false;
                if (res.success) {
                    if (window.navigator.standalone) {
                        localStorage.setItem("login-username", "");
                        localStorage.setItem("login-message", "");
                        localStorage.setItem("login-state", "");
                    }
                    window.location.reload();
                } else {
                    processing = false;
                    alert("There was an error logging you in: " + res.error);
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error logging you in: " + JSON.stringify(err));
            }
        });
    });
    $("#signout").click(function () {
        $.ajax({
            type: "GET",
            url: "/logout",
            data: {},
            success: function (res, status, xhr) {
                window.location.reload();
            }
        });
    });
});
