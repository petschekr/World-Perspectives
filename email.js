/*jslint node: true */
/*jslint esnext: true */
"use strict";
var Q = require("kew");
var db = require("orchestrate")("60e990e2-53e5-4be4-ba5c-5d4adf0cb6ca");
var sendgrid  = require("sendgrid")("petschekr", "WPP 2015");

db.newSearchBuilder()
	.collection("users")
	.limit(100)
	.query("value.registered: (NOT true)")
	.then(function (results) {
		var allPeople = [
			{
				"path": {
					"key": "petschekr"
				},
				"value": {
					"name": "Ryan Petschek",
					"code": "a1bd5967ba0f9d55ee4e84d268078b83"
				}
			}
		];
		allPeople = allPeople.concat(results.body.results);

		function promiseWhile (condition, body) {
			var done = Q.defer();
			function loop() {
				if (!condition())
					return done.resolve(allPeople);
				body().then(loop).fail(done.reject);
			}
			Q.fcall(loop);
			return done.promise;
		}

		var currentResults = results;

		return promiseWhile(
			function () {
				return currentResults.links && currentResults.links.next;
			},
			function () {
				return currentResults.links.next.get().then(function (newResults) {
					allPeople = allPeople.concat(newResults.body.results);
					currentResults = newResults;
					return Q.resolve();
				});
			}
		);
	})
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
				subject: "Final Call for Symposium Registration",
				text:
`Hi ${person.name},

You can register for this year's World Perspectives Symposium by clicking the following link:

https://wppsymposium.org/login/${person.code}

If you don't register for the symposium by Saturday, April 18th, you will be automatically placed into sessions.

Feel free to reply to this email if you're having any problems.

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
