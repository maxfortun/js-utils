const debug = require('debug')('js-utils-test');

const JSUtils = require('./index');

const context = {
	options: {
		uris: [
			`mongodb://127.0.0.1:47017/`,
			`mongodb://127.0.0.1:47018/`,
		],
		options: {
			useNewUrlParser: true,
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

