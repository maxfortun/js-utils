#!/usr/bin/env node

const fs = require('fs');

if(process.argv.length < 3) {
	console.log("Usage: "+process.argv[0]+" "+process.argv[1]+" <json1> [json2] ... [jsonN]");
	process.exit();
}

function merge(target, ...sources) {
	if (!sources.length) {
		return target;
	}

	const source = sources.shift();

	if(typeof source !== "object") {
		return merge(source, ...sources);
	}

	if(Array.isArray(target)) {
		for(let i = 0; i < source.length; i++) {
			let sourceValue = source[i];
			if(!target.includes(sourceValue)) {
				target.push(sourceValue);
			}
		}	
		return merge(target, ...sources);
	}

	for(let key in source) {
		if(!target[key]) {
			target[key] = source[key];
			continue;
		}
		merge(target[key], source[key]);
	}

	return merge(target, ...sources);
}

let result = null;
for(let i = 2; i < process.argv.length; i++) {
	let arg = process.argv[i];
	let text = arg;
	if(fs.existsSync(arg)) {
		text = fs.readFileSync(arg);
	}
	
	let json = JSON.parse(text);
	if(!result) {
		result = json;
		continue;
	}
	merge(result, json);
}


console.log(JSON.stringify(result));
