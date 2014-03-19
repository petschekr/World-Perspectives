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

    $("#mediabutton").click(function (e) {
        $("input[type=file]").click();
    });
    $("#mediaprogress").hide();
    $("input[type=file]").on("change", function () {
        var files = this.files;
        $("#mediaprogress").show();

        var xhr = new XMLHttpRequest();
        if (xhr.upload) {
            xhr.upload.onprogress = function (e) {
                var done = e.position || e.loaded;
                var total = e.totalSize || e.total;
                var percentDone = Math.floor(done / total * 1000) / 10;

                // Update progress bar
                $("#mediaprogress > div").css("width", percentDone + "%");
            };
        }
        xhr.onreadystatechange = function (e) {
            if (4 == this.readyState) {
                $("#mediaprogress").fadeOut(400, function () {
                    $("#mediaprogress > div").css("width", "0%");
                });
            }
        };
        xhr.open("POST", "/admin/presentations/media", true);

        var mediaData = new FormData();
        for (var i = 0; i < files.length; i++) {
            mediaData.append(i.toString(), files[i]);
        }
        xhr.send(mediaData);

        for (var i = 0; i < files.length; i++) {
            var file = files[i];

            var imageType = /image.*/;
            var videoType = /video.*/;

            var image = !!file.type.match(imageType);
            var video = !!file.type.match(videoType);
            if (!image && !video)
                continue;

            if (image) {
                var element = document.createElement("div");
                element.style.backgroundImage = "url(" + window.URL.createObjectURL(file) + ")";
            }
            if (video) {
                var element = document.createElement("video");
                element.src = window.URL.createObjectURL(file);
                element.play();
            }
            element.classList.add("thumbnail");

            /*element.onload = function(e): void {
            window.URL.revokeObjectURL(this.src);
            }*/
            document.getElementById("thumbnails").appendChild(element);
        }
    });
});
