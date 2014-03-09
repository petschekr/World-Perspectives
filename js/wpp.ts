declare var $;

$(document).ready(function(): void {
	$("#login-1 button").click(function(): void {
		var username: string = $("#login-1 > input").val().trim();
		$.ajax({
			type: "POST",
			url: "/login",
			data: {username: username},
			success: function(res, status, xhr) {
				if (res.success) {
					$("#login-message").text("Code sent to " + username + "@gfacademy.org").fadeIn();
					$("#login-2").fadeIn();
				}
				else {
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
		var username: string = $("#login-1 > input").val().trim();
		var code: string = $("#login-2 > input").val().trim();
		$.ajax({
			type: "GET",
			url: "/login",
			data: {code: code, username: username},
			success: function(res, status, xhr) {
				if (res.success) {
					window.location.reload();
				}
				else {
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
});