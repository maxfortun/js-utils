const debug = require('debug')('js-utils-test');

const JSUtils = require('./index');

const context = {
	options: {
		uris: [
			`mongodb://localhost:47017/?directConnection=true`,
			`mongodb://localhost:47018/?directConnection=true`,
		],
		options: {
			useNewUrlParser: true,
			useUnifiedTopology: true
		},
		debug: true,
		collection: "test",
		testSet: {
			a: { value: "a" },
			b: { value: "b" }
		}
	}
};

// jest.setTimeout(30000);

describe('mongodb', () => {

	test('mongodb_rs_uri', async () => {
		for(let uri of context.options.uris) {
			await JSUtils.mongodb_rs_uri(uri, context.options.options);
		}
	});

});

