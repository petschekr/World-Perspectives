$(document).ready(function () {
    // Mozilla Persona login
    $("#login").click(function () {
        navigator.id.request();
    });
    $("#signout").click(function () {
        navigator.id.logout();
    });

    var user = localStorage["email"];
    if (!user) {
        user = null;
    }
    navigator.id.watch({
        loggedInUser: user,
        onlogin: function (assertion) {
            $.ajax({
                type: "POST",
                url: "/persona/verify",
                data: { assertion: assertion },
                success: function (res, status, xhr) {
                    if (res.status == "okay") {
                        localStorage["email"] = res.email;
                        window.location.href = "/";
                    } else {
                        alert("There was an error logging you in: " + JSON.stringify(res));
                        navigator.id.logout();
                    }
                },
                error: function (xhr, status, err) {
                    navigator.id.logout();
                    console.error(err);
                    alert("There was an error logging you in");
                }
            });
        },
        onlogout: function () {
            $.ajax({
                type: "POST",
                url: "/persona/logout",
                success: function (res, status, xhr) {
                    localStorage["email"] = "";
                    window.location.reload();
                },
                error: function (xhr, status, err) {
                    console.error(err);
                    alert("There was an error logging you out");
                }
            });
        }
    });
});
