const debug = require('debug')('js-utils:test');

const JSUtils = require('./index');

const context = {
	options: {
		uris: [
			'mongodb://localhost:47017/?directConnection=true',
			'mongodb://localhost:47018/?directConnection=true',
		],
		rs_uri: 'mongodb://localhost:47017,localhost:47018/?directConnection=true&replicaSet=rs0',
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
	test('rs_uri', async () => {
		for(let uri of context.options.uris) {
			const rs_uri = await JSUtils.mongodb_rs_uri(uri, context.options.options);
			debug(uri, rs_uri);
			expect(rs_uri).toEqual(context.options.rs_uri);
		}
	});

});

