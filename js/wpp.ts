declare var $;
interface Navigator {
	id: {
		request: () => any;
		watch: (options: {
			loggedInUser?: string;
			onlogin: (assertion: string) => any;
			onlogout: () => any;
		}) => void;
		logout: () => any;
	}
}

$(document).ready(function(): void {
	// Mozilla Persona login
	$("#login-button").click(function(): void {
		navigator.id.request();
	});
	$("#logout-button").click(function(): void {
		navigator.id.logout();
	});

	var user: string = localStorage["email"];
	if (!user) {
		user = null;
	}
	navigator.id.watch({
		loggedInUser: user,
		onlogin: function (assertion) {
			$.ajax({
				type: "POST",
				url: "/persona/verify",
				data: {assertion: assertion},
				success: function(res, status, xhr) {
					if (res.status == "okay") {
						localStorage["email"] = res.email;
						window.location.href = "/classes";
					}
					else {
						alert("There was an error logging you in: " + JSON.stringify(res));
						navigator.id.logout();
					}
				},
				error: function(xhr, status, err) {
					navigator.id.logout();
					console.error(err);
					alert("There was an error logging you in");
				}
			});
		},
		onlogout: function() {
			$.ajax({
				type: "POST",
				url: "/persona/logout",
				success: function(res, status, xhr) {
					localStorage["email"] = "";
					window.location.reload();
				},
				error: function(xhr, status, err) {
					console.error(err);
					alert("There was an error logging you out");
				}
			});
		}
	});
});