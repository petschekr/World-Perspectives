var uploadedMedia = [];
var uploadedPDF;

var preferences = {};
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
    $(document).on("click", "#login-1 button", function () {
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
    $(document).on("click", "#login-2 button", function () {
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
    $(document).on("click", "#signout", function () {
        $.ajax({
            type: "GET",
            url: "/logout",
            data: {},
            success: function (res, status, xhr) {
                window.location.reload();
            }
        });
    });

    $(document).on("click", "#pdfbutton, #pdfeditbutton", function (e) {
        $("input[type=file]").first().click();
    });

    $(document).on("click", "#mediabutton, #mediaeditbutton", function (e) {
        $("input[type=file]").last().click();
    });

    // PDF file picker
    $("input[type=file]").first().on("change", function () {
        if (this.files.length < 1)
            return;
        var file = this.files[0];
        $("#create p").first().text(file.name);
        $("#pdfprogress").show();
        $("#pdfeditprogress").show();

        var xhr = new XMLHttpRequest();
        if (xhr.upload) {
            xhr.upload.onprogress = function (e) {
                var done = e.position || e.loaded;
                var total = e.totalSize || e.total;
                var percentDone = Math.floor(done / total * 1000) / 10;

                // Update progress bar
                $("#pdfprogress > div").css("width", percentDone + "%");
                $("#pdfeditprogress > div").css("width", percentDone + "%");
            };
        }
        xhr.onreadystatechange = function (e) {
            if (4 == this.readyState) {
                try  {
                    var response = JSON.parse(e.srcElement.response);
                } catch (e) {
                    console.error(e.srcElement.response);
                    alert("The server sent an invalid response");
                }
                if (response.status == "failure") {
                    console.error(response.reason);
                    alert("There was an error uploading your PDF: " + response.reason);
                }
                if (response.status == "success") {
                    uploadedPDF = response.id;
                }
                $("#pdfprogress").fadeOut(400, function () {
                    $("#pdfprogress > div").css("width", "0%");
                });
                $("#pdfeditprogress").fadeOut(400, function () {
                    $("#pdfeditprogress > div").css("width", "0%");
                });
            }
        };
        xhr.open("POST", "/admin/presentations/media", true);

        var mediaData = new FormData();
        mediaData.append("type", "pdf");
        mediaData.append("pdf", file);
        xhr.send(mediaData);
    });

    // Image / video file picker
    $("input[type=file]").last().on("change", function () {
        var files = this.files;
        if (files.length < 1)
            return;
        $("#mediaprogress").show();
        $("#mediabutton").css("opacity", "0.3");
        $("#mediaeditprogress").show();
        $("#mediaeditbutton").css("opacity", "0.3");

        var xhr = new XMLHttpRequest();
        if (xhr.upload) {
            xhr.upload.onprogress = function (e) {
                var done = e.position || e.loaded;
                var total = e.totalSize || e.total;
                var percentDone = Math.floor(done / total * 1000) / 10;

                // Update progress bar
                $("#mediaprogress > div").css("width", percentDone + "%");
                $("#mediaeditprogress > div").css("width", percentDone + "%");
            };
        }
        xhr.onreadystatechange = function (e) {
            if (4 == this.readyState) {
                $("#mediabutton").css("opacity", "1");
                $("#mediaeditbutton").css("opacity", "1");
                try  {
                    var response = JSON.parse(e.srcElement.response);
                } catch (e) {
                    console.error(e.srcElement.response);
                    alert("The server sent an invalid response");
                }
                if (response.status == "failure") {
                    console.error(response.reason);
                    alert("There was an error uploading your image or video");
                }
                if (response.status == "success") {
                    // response.ids is an array of form [id.jpg, id.png]
                    uploadedMedia = uploadedMedia.concat(response.ids);
                }
                $("#mediaprogress").fadeOut(400, function () {
                    $("#mediaprogress > div").css("width", "0%");
                });
                $("#mediaeditprogress").fadeOut(400, function () {
                    $("#mediaeditprogress > div").css("width", "0%");
                });
            }
        };
        xhr.open("POST", "/admin/presentations/media", true);

        var mediaData = new FormData();
        mediaData.append("type", "media");
        for (var i = 0; i < files.length; i++) {
            mediaData.append(i.toString(), files[i]);
        }
        xhr.send(mediaData);

        for (var i = 0; i < files.length; i++) {
            var file = files[i];

            var imageType = /image.*/;

            var image = !!file.type.match(imageType);
            if (!image)
                continue;

            var element = document.createElement("div");
            element.style.backgroundImage = "url(" + window.URL.createObjectURL(file) + ")";
            element.classList.add("thumbnail");

            /*element.onload = function(e): void {
            window.URL.revokeObjectURL(this.src);
            }*/
            document.getElementById("thumbnails").appendChild(element);
        }
    });
    $(document).on("click", ".thumbnail:not(#presentationthumbnails .thumbnail)", function () {
        var deleteConfirm = confirm("Are you sure that you want to delete that image/video?");
        if (!deleteConfirm)
            return;
        var mediaElement = $(this);
        var mediaID = mediaElement.css("backgroundImage");
        mediaID = mediaID.match(/\/media\/([a-f\d]*\.*.+?)\)/)[1];
        $.ajax({
            type: "DELETE",
            url: "/admin/presentations/media",
            data: { id: mediaID },
            success: function (res, status, xhr) {
                if (res.status == "success") {
                    mediaElement.fadeOut(400, function () {
                        mediaElement.remove();
                    });
                } else {
                    console.error(res);
                    alert("There was an error deleting the image or video");
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error deleting the image or video");
            }
        });
    });
    $(document).on("click", "#createbutton", function () {
        var data = {
            "name": $("#create input").get(0).value,
            "title": $("#create input").get(1).value,
            "youtubeID": $("#create input").get(3).value,
            "uploadedMedia": JSON.stringify(uploadedMedia),
            "uploadedPDF": uploadedPDF,
            "abstract": $("#create textarea").val(),
            "session": undefined,
            "location": undefined,
            "locationCapacity": undefined
        };
        var location = $("select").first().val();
        location = location.match(/([\w ]+) /)[1];
        data.location = location;
        var locationCapacity = $("#create option").eq($("select").first().get(0).selectedIndex).data("capacity");
        data.locationCapacity = locationCapacity;

        var session = $("#create select").last().val();
        session = session.match(/^Session (\d)/)[1];
        data.session = session;
        if (data.name === "" || data.title === "" || data.abstract === "") {
            alert("You must fill out the presentation's title, abstract and presenter");
            return;
        }
        if (data.youtubeID === "") {
            var message = "Are you sure you want to create this presentation without a video? (You can add this later too)";
            if (!confirm(message)) {
                return;
            }
        } else {
            var youtubeURL = /https?:\/\/.*?\.youtube.*\/watch\?v=(.*)/i;
            var youtubeID = data.youtubeID.match(youtubeURL);
            if (!youtubeID || typeof (youtubeID[1]) != "string" || youtubeID[1].length < 1) {
                alert("Invalid YouTube URL");
                return;
            }
            data.youtubeID = youtubeID[1];
        }
        $.ajax({
            type: "POST",
            url: "/admin/presentations",
            data: data,
            success: function (res, status, xhr) {
                if (res.status == "success") {
                    //$("#create").removeClass("active");
                    window.location.reload();
                } else {
                    console.error(res);
                    alert("There was an error creating the presentation");
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error creating the presentation");
            }
        });
        uploadedMedia = [];
    });
    $(document).on("click", "#regeneratecode", function () {
        var length = window.location.pathname.split("/").length;
        var id = window.location.pathname.split("/")[length - 1];
        $.ajax({
            type: "GET",
            url: "/admin/presentations/code",
            data: { "id": id },
            success: function (res, status, xhr) {
                if (res.status == "success") {
                    $(".code").text(res.code);
                } else {
                    console.error(res);
                    alert("There was an error regenerating the code");
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error regenerating the code");
            }
        });
    });
    $(document).on("click", "#updatebutton", function () {
        var data = {
            "name": $("input").get(0).value,
            "title": $("input").get(1).value,
            "youtubeID": $("input").get(2).value,
            "uploadedMedia": JSON.stringify(uploadedMedia),
            "uploadedPDF": uploadedPDF,
            "abstract": $("textarea").val(),
            "session": undefined,
            "location": undefined,
            "locationCapacity": undefined
        };
        var location = $("select").first().val();
        location = location.match(/([\w ]+) /)[1];
        data.location = location;
        var locationCapacity = $("#create option").eq($("select").first().get(0).selectedIndex).data("capacity");
        data.locationCapacity = locationCapacity;

        var session = $("select").eq(1).val();
        session = session.match(/^Session (\d)/)[1];
        data.session = session;
        if (data.name === "" || data.title === "" || data.abstract === "") {
            alert("You must fill out the presentation's title, abstract and presenter");
            return;
        }
        if (data.youtubeID !== "") {
            var youtubeURL = /https?:\/\/.*?\.youtube.*\/watch\?v=(.*)/i;
            var youtubeID = data.youtubeID.match(youtubeURL);
            if (!youtubeID || typeof (youtubeID[1]) != "string" || youtubeID[1].length < 1) {
                alert("Invalid YouTube URL");
                return;
            }
            data.youtubeID = youtubeID[1];
        }
        $.ajax({
            type: "POST",
            url: window.location.toString(),
            data: data,
            success: function (res, status, xhr) {
                if (res.status == "success") {
                    alert("Presentation updated successfully");
                    window.location.reload();
                } else {
                    console.error(res);
                    alert("There was an error updating the presentation");
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error updating the presentation");
            }
        });
    });
    $(document).on("click", "#deletepresentation", function () {
        var message = "Are you sure that you want to delete this presentation? This cannot be undone.";
        if (!confirm(message))
            return;
        $.ajax({
            type: "DELETE",
            url: window.location.toString(),
            data: {},
            success: function (res, status, xhr) {
                if (res.status == "success") {
                    alert("Presentation deleted successfully");
                    window.location.assign("/admin/presentations");
                } else {
                    console.error(res);
                    alert("There was an error deleting the presentation");
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("There was an error deleting the presentation");
            }
        });
    });
    $(document).on("touchend", "#presentationthumbnails .thumbnail", function () {
        $("#imagemodal .content div").css("backgroundImage", $(this).css("backgroundImage"));
        $("#imagemodal").addClass("active");
    });

    $(document).on("touchend", ".btns button", function () {
        var preference = parseInt($(this).data("order"), 10);
        var id = $(this).data("id");

        // Deselect other buttons
        $(this).siblings().css("opacity", "1");
        $(this).css("opacity", "0.3");

        for (var i = 1; i <= 3; i++) {
            if (preferences[i] == id) {
                $("*[data-id=" + id + "][data-order=" + i + "]").css("opacity", "1");
                delete preferences[i];
            }
        }

        // Deselect other button of same choice
        if (preferences[preference])
            $("*[data-id=" + preferences[preference] + "][data-order=" + preference + "]").css("opacity", "1");

        preferences[preference] = id;
    });
    $(document).on("touchend", "#finish-session", function (e) {
        var numberSelected = Object.keys(preferences).length;
        if (numberSelected !== 3) {
            alert("You must select three choices");
            return;
        }

        // document.title = "Session 1", "Session 2", etc.
        localStorage.setItem(document.title, JSON.stringify(preferences));
        preferences = {};
        window.PUSH({
            url: "/register",
            hash: "",
            timeout: undefined,
            transition: "slide-out"
        });
    });
    $(document).on("touchend", "#finish-registering", function () {
        var data = {};
        for (var i = 1; i <= 4; i++) {
            try  {
                data["Session " + i] = JSON.parse(localStorage.getItem("Session " + i));
            } catch (e) {
                alert("Invalid preference data");
                return;
            }
            if (!data["Session " + i]) {
                alert("You must select your preferences for each session");
                return;
            }
        }

        $.ajax({
            type: "POST",
            url: "/register",
            data: { payload: JSON.stringify(data) },
            success: function (res, status, xhr) {
                if (res.status == "success") {
                    $(".content").fadeOut();
                } else {
                    console.error(res);
                    alert("An error occurred while registering");
                }
            },
            error: function (xhr, status, err) {
                console.error(err);
                alert("An error occurred while registering");
            }
        });
    });
    function pageLoad() {
        if (window.location.pathname == "/register") {
            if (localStorage["Session 1"]) {
                $("a[href='/register/1'] span.icon-check").css("opacity", "1");
            }
            if (localStorage["Session 2"]) {
                $("a[href='/register/2'] span.icon-check").css("opacity", "1");
            }
            if (localStorage["Session 3"]) {
                $("a[href='/register/3'] span.icon-check").css("opacity", "1");
            }
            if (localStorage["Session 4"]) {
                $("a[href='/register/4'] span.icon-check").css("opacity", "1");
            }
        }
        if (window.location.pathname.match(/^\/register\/\d$/)) {
            // Load register preferences
            preferences = JSON.parse(localStorage.getItem(document.title));
            for (var key in preferences) {
                $("*[data-id=" + preferences[key] + "][data-order=" + key + "]").css("opacity", "0.3");
            }
        }
    }
    window.addEventListener("push", pageLoad);
    pageLoad();
});
