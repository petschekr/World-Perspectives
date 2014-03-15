declare var $;
interface Navigator {
	standalone: boolean;
}

$(document).ready(function(): void {
	if (window.navigator.standalone) {
		if (localStorage.getItem("login-state") == "2") {
			$("#login-1 > input").val(localStorage.getItem("login-username"));
			$("#login-message").text(localStorage.getItem("login-message")).show();
			$("#login-2").show();
			$("#login").addClass("active");
		}
	}
	var processing: boolean = false;
	$("#login-1 button").click(function(): void {
		if (processing)
			return;
		else
			processing = true;
		var username: string = $("#login-1 > input").val().trim();
		$("#login-1 button").text("Sending code...");
		$("#login-1 button").attr("disabled", "disabled");
		$.ajax({
			type: "POST",
			url: "/login",
			data: {username: username},
			success: function(res, status, xhr) {
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
				}
				else {
					processing = false;
					alert("There was an error logging you in: " + res.error);
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error logging you in: " + JSON.stringify(err));
			}
		});
	});
	$("#login-2 button").click(function(): void {
		if (processing)
			return;
		else
			processing = true;
		var username: string = $("#login-1 > input").val().trim();
		var code: string = $("#login-2 > input").val().trim();
		$.ajax({
			type: "GET",
			url: "/login",
			data: {code: code, username: username},
			success: function(res, status, xhr) {
				processing = false;
				if (res.success) {
					if (window.navigator.standalone) {
						localStorage.setItem("login-username", "");
						localStorage.setItem("login-message", "");
						localStorage.setItem("login-state", "");
					}
					window.location.reload();
				}
				else {
					processing = false;
					alert("There was an error logging you in: " + res.error);
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error logging you in: " + JSON.stringify(err));
			}
		});
	});
	$("#signout").click(function(): void {
		$.ajax({
			type: "GET",
			url: "/logout",
			data: {},
			success: function(res, status, xhr) {
				window.location.reload();
			}
		});
	});

	$("#mediabutton").click(function(e): void{
		$("input[type=file]").click();
	});
	$("input[type=file]").on("change", function(): void {
		var files: FileList = this.files;

		var xhr: XMLHttpRequest = new XMLHttpRequest();
		if (xhr.upload) {
			xhr.upload.onprogress = function(e: any): void {
				var done: number = e.position || e.loaded;
				var total: number = e.totalSize || e.total;
				var percentDone: number = Math.floor(done / total * 1000) / 10
				// Update progress bar
			};
		}
		xhr.onreadystatechange = function(e: any): void {
			if (4 == this.readyState) {
				console.log(['xhr upload complete', e]);
			}
		};
		xhr.open("POST", "/admin/presentations/media", true);

		var mediaData: FormData = new FormData();
		for (var i: number = 0; i < files.length; i++) {
			mediaData.append(i.toString(), files[i]);
		}
		xhr.send(mediaData);
	});
});