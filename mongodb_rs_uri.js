const debug = require('debug')('js-utils:mongodb_rs_uri');

const { MongoClient } = require('mongodb');
const { URL } = require('url');

/**
 * Connects to a MongoDB service endpoint, discovers the replica set members,
 * and returns a rewritten URI with proper hostnames from rs.conf().
 *
 * @param {string} uri - A mongodb:// connection string with a service hostname
 * @returns {Promise<string>} - A corrected mongodb:// URI listing all members
 */
module.exports = async function mongodb_rs_uri(uri, options) {
	const client = new MongoClient(uri, options);
	try {
		await client.connect();

		// Run replSetGetConfig to discover replica set members
		const adminDb = client.db('admin');
		const result = await adminDb.command({ replSetGetConfig: 1 });

		const members = result.config.members.map(m => m.host);

		// Parse original URI so we keep username, password, db, and options
		const u = new URL(uri);

		const username = u.username ? decodeURIComponent(u.username) : null;
		const password = u.password ? decodeURIComponent(u.password) : null;
		const pathname = u.pathname; // includes leading /
		const search = u.search;	 // includes leading ? (may already have replicaSet etc.)

		// If replicaSet is missing, preserve from config
		const searchParams = new URLSearchParams(search);
		if (!searchParams.has('replicaSet')) {
			searchParams.set('replicaSet', result.config._id);
		}

		// Build new URI
		let auth = '';
		if (username) {
			auth = encodeURIComponent(username);
			if (password) auth += ':' + encodeURIComponent(password);
			auth += '@';
		}

		const newUri = `mongodb://${auth}${members.join(',')}${pathname}?${searchParams.toString()}`;
	debug(uri, '->', newUri);
		return newUri;
	} finally {
		await client.close();
	}
}


