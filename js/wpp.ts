declare var $;
interface Navigator {
	standalone: boolean;
}
interface HTMLElement {
	src: string;
	type: string;
	controls: boolean;
	preload: string;
	play: () => void;
	load: any;
	canPlayType: any;
}
interface Window {
	URL: any;
}

var uploadedMedia: string[] = [];
var uploadedPDF: string;
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
	$(document).on("click", "#login-1 button", function(): void {
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
	$(document).on("click", "#login-2 button", function(): void {
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
	$(document).on("click", "#signout", function(): void {
		$.ajax({
			type: "GET",
			url: "/logout",
			data: {},
			success: function(res, status, xhr) {
				window.location.reload();
			}
		});
	});

	$(document).on("click", "#pdfbutton, #pdfeditbutton", function(e): void {
		$("input[type=file]").first().click();
	});

	$(document).on("click", "#mediabutton, #mediaeditbutton", function(e): void {
		$("input[type=file]").last().click();
	});
	// PDF file picker
	$("input[type=file]").first().on("change", function(): void {
		if (this.files.length < 1)
			return;
		var file: File = this.files[0];
		$("#create p").text(file.name);
		$("#pdfprogress").show();
		$("#pdfeditprogress").show();

		var xhr: XMLHttpRequest = new XMLHttpRequest();
		if (xhr.upload) {
			xhr.upload.onprogress = function(e: any): void {
				var done: number = e.position || e.loaded;
				var total: number = e.totalSize || e.total;
				var percentDone: number = Math.floor(done / total * 1000) / 10
				// Update progress bar
				$("#pdfprogress > div").css("width", percentDone + "%");
				$("#pdfeditprogress > div").css("width", percentDone + "%");
			};
		}
		xhr.onreadystatechange = function(e: any): void {
			if (4 == this.readyState) {
				try {
					var response: any = JSON.parse(e.srcElement.response);
				}
				catch (e) {
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
				$("#pdfprogress").fadeOut(400, function(): void {
					$("#pdfprogress > div").css("width", "0%");
				});
				$("#pdfeditprogress").fadeOut(400, function(): void {
					$("#pdfeditprogress > div").css("width", "0%");
				});
			}
		};
		xhr.open("POST", "/admin/presentations/media", true);

		var mediaData: FormData = new FormData();
		mediaData.append("type", "pdf");
		mediaData.append("pdf", file);
		xhr.send(mediaData);
	});
	// Image / video file picker
	$("input[type=file]").last().on("change", function(): void {
		var files: FileList = this.files;
		if (files.length < 1)
			return;
		$("#mediaprogress").show();
		$("#mediabutton").css("opacity", "0.3");
		$("#mediaeditprogress").show();
		$("#mediaeditbutton").css("opacity", "0.3");

		var xhr: XMLHttpRequest = new XMLHttpRequest();
		if (xhr.upload) {
			xhr.upload.onprogress = function(e: any): void {
				var done: number = e.position || e.loaded;
				var total: number = e.totalSize || e.total;
				var percentDone: number = Math.floor(done / total * 1000) / 10
				// Update progress bar
				$("#mediaprogress > div").css("width", percentDone + "%");
				$("#mediaeditprogress > div").css("width", percentDone + "%");
			};
		}
		xhr.onreadystatechange = function(e: any): void {
			if (4 == this.readyState) {
				$("#mediabutton").css("opacity", "1");
				$("#mediaeditbutton").css("opacity", "1");
				try {
					var response: any = JSON.parse(e.srcElement.response);
				}
				catch (e) {
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
				$("#mediaprogress").fadeOut(400, function(): void {
					$("#mediaprogress > div").css("width", "0%");
				});
				$("#mediaeditprogress").fadeOut(400, function(): void {
					$("#mediaeditprogress > div").css("width", "0%");
				});
			}
		};
		xhr.open("POST", "/admin/presentations/media", true);

		var mediaData: FormData = new FormData();
		mediaData.append("type", "media");
		for (var i: number = 0; i < files.length; i++) {
			mediaData.append(i.toString(), files[i]);
		}
		xhr.send(mediaData);

		// Create thumbnails
		for (var i = 0; i < files.length; i++) {
			var file = files[i];
			
			var imageType: RegExp = /image.*/;

			var image: boolean = !!file.type.match(imageType);
			if (!image)
				continue;
			
			var element: HTMLElement = document.createElement("div");
			element.style.backgroundImage = "url(" + window.URL.createObjectURL(file) + ")";
			element.classList.add("thumbnail");
			/*element.onload = function(e): void {
				window.URL.revokeObjectURL(this.src);
			}*/
			
			document.getElementById("thumbnails").appendChild(element);
		}
	});
	$(document).on("click", ".thumbnail:not(#presentationthumbnails .thumbnail)", function(): void {
		var deleteConfirm: boolean = confirm("Are you sure that you want to delete that image/video?");
		if (!deleteConfirm)
			return;
		var mediaElement = $(this);
		var mediaID: string = mediaElement.css("backgroundImage");
		mediaID = mediaID.match(/\/media\/([a-f\d]*\.*.+?)\)/)[1];
		$.ajax({
			type: "DELETE",
			url: "/admin/presentations/media",
			data: {id: mediaID},
			success: function(res, status, xhr) {
				if (res.status == "success") {
					mediaElement.fadeOut(400, function(): void {
						mediaElement.remove();
					});
				}
				else {
					console.error(res);
					alert("There was an error deleting the image or video");
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error deleting the image or video");
			}
		});
	});
	$(document).on("click", "#createbutton", function(): void {
		var data: {
			name: string;
			title: string;
			youtubeID: string;
			uploadedMedia: string;
			uploadedPDF: string;
			abstract: string;
			session: string;
		} = {
			"name": $("#create input").get(0).value,
			"title": $("#create input").get(1).value,
			"youtubeID": $("#create input").get(3).value,
			"uploadedMedia": JSON.stringify(uploadedMedia),
			"uploadedPDF": uploadedPDF,
			"abstract": $("#create textarea").val(),
			"session": undefined
		};
		var session: string = $("#create select").val();
		session = session.match(/^Session (\d)/)[1];
		data.session = session;
		if (data.name === "" || data.title === "" || data.abstract === "") {
			alert("You must fill out the presentation's title, abstract and presenter");
			return;
		}
		if (data.youtubeID === "") {
			var message: string = "Are you sure you want to create this presentation without a video? (You can add this later too)";
			if (!confirm(message)) {
				return;
			}
		}
		else {
			var youtubeURL: RegExp = /https?:\/\/.*?\.youtube.*\/watch\?v=(.*)/i;
			var youtubeID: any = data.youtubeID.match(youtubeURL);
			if (!youtubeID || typeof(youtubeID[1]) != "string" || youtubeID[1].length < 1) {
				alert("Invalid YouTube URL");
				return;
			}
			data.youtubeID = youtubeID[1];
		}
		$.ajax({
			type: "POST",
			url: "/admin/presentations",
			data: data,
			success: function(res, status, xhr) {
				if (res.status == "success") {
					//$("#create").removeClass("active");
					window.location.reload();
				}
				else {
					console.error(res);
					alert("There was an error creating the presentation");
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error creating the presentation");
			}
		});
		uploadedMedia = [];
	});
	$(document).on("click", "#regeneratecode", function(): void {
		var length: number = window.location.pathname.split("/").length;
		var id: string = window.location.pathname.split("/")[length - 1];
		$.ajax({
			type: "GET",
			url: "/admin/presentations/code",
			data: {"id": id},
			success: function(res, status, xhr) {
				if (res.status == "success") {
					$(".code").text(res.code);
				}
				else {
					console.error(res);
					alert("There was an error regenerating the code");
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error regenerating the code");
			}
		});
	});
	$(document).on("click", "#updatebutton", function(): void {
		var data: {
			name: string;
			title: string;
			youtubeID: string;
			uploadedMedia: string;
			uploadedPDF: string;
			abstract: string;
			session: string;
		} = {
			"name": $("input").get(0).value,
			"title": $("input").get(1).value,
			"youtubeID": $("input").get(2).value,
			"uploadedMedia": JSON.stringify(uploadedMedia),
			"uploadedPDF": uploadedPDF,
			"abstract": $("textarea").val(),
			"session": undefined
		};
		var session: string = $("#create select").val();
		session = session.match(/^Session (\d)/)[1];
		data.session = session;
		if (data.name === "" || data.title === "" || data.abstract === "") {
			alert("You must fill out the presentation's title, abstract and presenter");
			return;
		}
		if (data.youtubeID === "") {
			var message: string = "Are you sure you want to create this presentation without a video? (You can add this later too)";
			if (!confirm(message)) {
				return;
			}
		}
		else {
			var youtubeURL: RegExp = /https?:\/\/.*?\.youtube.*\/watch\?v=(.*)/i;
			var youtubeID: any = data.youtubeID.match(youtubeURL);
			if (!youtubeID || typeof(youtubeID[1]) != "string" || youtubeID[1].length < 1) {
				alert("Invalid YouTube URL");
				return;
			}
			data.youtubeID = youtubeID[1];
		}
		$.ajax({
			type: "POST",
			url: window.location.toString(),
			data: data,
			success: function(res, status, xhr) {
				if (res.status == "success") {
					alert("Presentation updated successfully");
					window.location.reload();
				}
				else {
					console.error(res);
					alert("There was an error updating the presentation");
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error updating the presentation");
			}
		});
	});
	$(document).on("click", "#deletepresentation", function(): void {
		var message: string = "Are you sure that you want to delete this presentation? This cannot be undone.";
		if (!confirm(message))
			return;
		$.ajax({
			type: "DELETE",
			url: window.location.toString(),
			data: {},
			success: function(res, status, xhr) {
				if (res.status == "success") {
					alert("Presentation deleted successfully");
					window.location.assign("/admin/presentations");
				}
				else {
					console.error(res);
					alert("There was an error deleting the presentation");
				}
			},
			error: function(xhr, status, err) {
				console.error(err);
				alert("There was an error deleting the presentation");
			}
		});
	});
	$(document).on("touchend", "#presentationthumbnails .thumbnail", function(): void {
		$("#imagemodal .content div").css("backgroundImage", $(this).css("backgroundImage"));
		$("#imagemodal").addClass("active");
	});
});