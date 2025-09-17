const debug = require('debug')('js-utils-test');

const MongooseJSProxy = require('./index');

const MONGO_PORT = process.env.MONGO_PORT || 27017;

const context = {
	options: {
		uri: `mongodb://test:test@127.0.0.1:${MONGO_PORT}/`,
		options: {
			useNewUrlParser: true
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

	test('connect', async () => {
		context.mongoose = async function() {
			if(this.connectPromise) {
				return this.connectPromise;
			}

			this._mongoose = require('mongoose');
			if(context.options.debug) {
				this._mongoose.set('debug', context.options.debug);
			}

			return this.connectPromise = this._mongoose.connect(context.options.uri, context.options.options);
		}

		return await context.mongoose();
	});

	test('diconnect', async () => {
		await (await context.mongoose()).disconnect();
	});

});
