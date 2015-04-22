/*jslint node: true */
/*jslint esnext: true */
"use strict";
var Q = require("kew");
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");
var sendgrid  = require("sendgrid")("petschekr", "WPP 2015");

function searchGetAll (collection, search) {
	var allResults = [];

	function promiseWhile (condition, body) {
		var done = Q.defer();
		function loop() {
			if (!condition()) {
				return done.resolve(allResults);
			}
			body().then(loop).fail(done.reject);
		}
		Q.fcall(loop);
		return done.promise;
	}

	return db.newSearchBuilder()
		.collection(collection)
		.limit(100)
		.query(search)
		.then(function (results) {
			allResults = allResults.concat(results.body.results);
			var currentResults = results;
			return promiseWhile(
				function () {
					return currentResults.links && currentResults.links.next;
				},
				function () {
					return currentResults.links.next.get().then(function (newResults) {
						allResults = allResults.concat(newResults.body.results);
						currentResults = newResults;
						return Q.resolve();
					});
				}
			);
		});
}

searchGetAll("users", "*")
	.then(function (allPeople) {
		allPeople = allPeople.map(function (person) {
			var infoObject = {};
			infoObject.name = person.value.name;
			infoObject.code = person.value.code;
			infoObject.email = person.path.key + "@gfacademy.org";
			return infoObject;
		});

		var emailPromises = [];
		allPeople.forEach(function (person) {
			var email = new sendgrid.Email({
				to: person.email,
				from: "registration@wppsymposium.org",
				subject: "Your Schedule for the World Perspectives Symposium",
				text:
`Hi ${person.name},

Hard copies of everyone's schedules will be available around 8:00 AM in the atrium.

You can also view a digital version of your schedule by clicking the link below.

https://wppsymposium.org/login/${person.code}

You can print out a copy of your schedule by clicking the print button at the top right of the page.

Thanks,
The GFA World Perspectives Program Team`
			});
			var deferrer = Q.defer();
			sendgrid.send(email, function (err, json) {
				if (err) {
					deferrer.reject(err);
				}
				else {
					setTimeout(function() {
						console.log("Sent to:", email.to);
						deferrer.resolve(json);
					}, 2000);
				}
			});
			emailPromises.push(deferrer.promise);
		});
		console.log("Total people:", allPeople.length);
		console.log("Total promises:", emailPromises.length);

		return Q.all(emailPromises);
	})
	.then(function () {
		console.log("Finished!");
	})
	.fail(function (err) {
		console.error("An error occurred:");
		console.error(err);
	});
