#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import http from 'http';
import https from 'https';

// ---- SCRIPT NAME ----
const scriptName = process.argv[1].split('/').pop();

// ---- USAGE ----
function printUsage() {
    console.log(`
Usage: ${scriptName} [options]

Options:
  -u, --url <url_with_{0}_{1}_...>       URL template with positional placeholders.
  -f, --file <file>                      Input file(s). Can be specified multiple times.
  -s, --separator <regex>                Regex separator for splitting lines (default: any whitespace).
  -b, --body <body_or_{N}>               Optional POST body. Can be a literal, a file path, or a positional placeholder.
  -m, --method <HTTP_METHOD_or_{N}>      Optional HTTP method. Defaults to POST if body exists, otherwise GET.
  -r, --rate <N>                         Optional rate limit (stories per minute). Default: 0 (disabled).
  -w, --workers <N>                       Number of parallel workers. Default: 1 (sequential).
  -p, --progress <folder>                Optional folder to store progress marker files. Only creates marker files if specified.
  -pm, --progress-marker <ext>           Optional marker file extension (default: done).
  -H, --header <'Header: Value_or_{N}'>  Optional header. Can be specified multiple times. Supports positional placeholders.
  -o, --output <folder>                  Optional folder to store response bodies.
  -oe, --output-extension <ext>          Optional extension for saved response files.
  -d, --debug                            Print dynamically generated URL, headers, method, body, and response headers.
  -nf, --no-follow                       Disable automatic HTTP redirects.
  -fc, --fail-codes <codes>              Comma-separated list of HTTP status codes that should cause the script to exit (default: 303,401,403)
  -h, --help                             Show this usage information.
`);
}

// ---- ARG PARSING ----
function getArg(names, def = undefined) {
    for (const name of names) {
        const idx = process.argv.indexOf(name);
        if (idx !== -1 && idx + 1 < process.argv.length) {
            return process.argv[idx + 1];
        }
    }
    return def;
}

// ---- HELP OPTION ----
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
}

// ---- OPTIONS ----
const urlTemplate = getArg(['--url', '-u']);
let filePaths = [];
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--file' || process.argv[i] === '-f') {
        if (i + 1 < process.argv.length) {
            filePaths.push(process.argv[i + 1]);
            i++;
        }
    }
}
const separatorArg = getArg(['--separator', '-s'], '\\s+');
const bodyParam = getArg(['--body', '-b'], null);
let methodParam = getArg(['--method', '-m'], null);
const rateLimit = parseInt(getArg(['--rate', '-r'], '0'), 10);
const numWorkers = parseInt(getArg(['--workers', '-w'], '1'), 10);
const progressFolder = getArg(['--progress', '-p'], null);
const progressMarkerExt = getArg(['--progress-marker', '-pm'], 'done');
const outputFolder = getArg(['--output', '-o'], null);
const outputExtension = getArg(['--output-extension', '-oe'], 'txt');
const debug = process.argv.includes('--debug') || process.argv.includes('-d');
const noFollow = process.argv.includes('--no-follow') || process.argv.includes('-nf');
const failCodesArg = getArg(['--fail-codes', '-fc'], '303,401,403');
const failCodes = new Set(failCodesArg.split(',').map(c => parseInt(c.trim(), 10)));

// Multiple headers
const headerArgs = [];
for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--header' || process.argv[i] === '-H') {
        if (i + 1 < process.argv.length) {
            headerArgs.push(process.argv[i + 1]);
            i++;
        }
    }
}

// ---- VALIDATE REQUIRED ----
if (!urlTemplate || filePaths.length === 0) {
    console.error('Error: --url and at least one --file are required.');
    printUsage();
    process.exit(1);
}

// Ensure progress folder exists if specified
if (progressFolder) {
    if (!fs.existsSync(progressFolder)) {
        fs.mkdirSync(progressFolder, { recursive: true });
    }
}

// Ensure output folder exists if specified
if (outputFolder) {
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }
}

// Separator regex
let separatorRegex;
try {
    separatorRegex = new RegExp(separatorArg);
} catch (err) {
    console.error(`Invalid separator regex: ${separatorArg}`);
    process.exit(1);
}

// ---- PERSISTENT AGENTS ----
const isHttps = urlTemplate.startsWith('https:');
const agent = isHttps
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });

// ---- THROTTLING ----
let tokens = rateLimit > 0 ? rateLimit : Infinity;
const maxTokens = tokens;
if (rateLimit > 0) {
    setInterval(() => {
        tokens = Math.min(maxTokens, tokens + rateLimit / 60);
    }, 1000);
}
async function throttle() {
    if (rateLimit === 0) return;
    while (tokens < 1) {
        await new Promise((res) => setTimeout(res, 100));
    }
    tokens -= 1;
}

// ---- HELPER FUNCTIONS ----
function replacePlaceholders(template, values) {
    let result = template;
    const regex = /{(\d+)}/g;
    result = result.replace(regex, (match, idx) => {
        idx = parseInt(idx, 10);
        if (idx >= values.length) {
            console.error(`Error: placeholder {${idx}} not found in line values`);
            process.exit(1);
        }
        return values[idx];
    });
    return result;
}

function buildBody(bodyTemplate, values) {
    if (!bodyTemplate) return null;

    const placeholderMatch = bodyTemplate.match(/{(\d+)}/);
    if (placeholderMatch) {
        const idx = parseInt(placeholderMatch[1], 10);
        if (idx >= values.length) {
            console.error(`Error: line has no value at position ${idx} for body placeholder`);
            process.exit(1);
        }
        let content = values[idx];
        if (fs.existsSync(content)) {
            content = fs.readFileSync(content, 'utf8');
        }
        bodyTemplate = bodyTemplate.replace(`{${idx}}`, content);
    }

    if (fs.existsSync(bodyTemplate)) {
        return fs.readFileSync(bodyTemplate, 'utf8');
    } else {
        return bodyTemplate;
    }
}

function determineMethod(methodTemplate, values, body) {
    if (!methodTemplate) return body ? 'POST' : 'GET';
    return replacePlaceholders(methodTemplate, values).toUpperCase();
}

function buildHeaders(headerArgs, values, body) {
    const headers = {};
    for (const h of headerArgs) {
        const sep = h.indexOf(':');
        if (sep !== -1) {
            const key = h.slice(0, sep).trim();
            const valTemplate = h.slice(sep + 1).trim();
            const val = replacePlaceholders(valTemplate, values);
            headers[key] = val;
        }
    }
    if (body && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
        let contentType = 'application/octet-stream';
        const trimmed = body.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) contentType = 'application/json';
        else if (trimmed.startsWith('<')) contentType = 'application/xml';
        headers['Content-Type'] = contentType;
    }
    return headers;
}

function getMarkerPath(line) {
    if (!progressFolder) return null;
    const safeName = line.replace(/[^a-zA-Z0-9-]/g, '_') + `.${progressMarkerExt}`;
    return path.join(progressFolder, safeName);
}

function getOutputPath(line) {
    if (!outputFolder) return null;
    const safeName = line.replace(/[^a-zA-Z0-9-]/g, '_');
    const ext = process.argv.includes('--output-extension') || process.argv.includes('-oe')
        ? `.${outputExtension}`
        : '.response';
    return path.join(outputFolder, safeName + ext);
}

// ---- PROCESS SINGLE LINE ----
async function processLine(trimmed) {
    const values = trimmed.split(separatorRegex);
    const markerPath = getMarkerPath(trimmed);

    if (markerPath && fs.existsSync(markerPath)) {
        console.log(`Skipping line "${trimmed}" - already marked as done`);
        return;
    }

    await throttle();

    const urlStr = replacePlaceholders(urlTemplate, values);
    const body = buildBody(bodyParam, values);
    const httpMethod = determineMethod(methodParam, values, body);
    const headers = buildHeaders(headerArgs, values, body);

    if (debug) {
        console.log('--- DEBUG ---');
        console.log('Line:', trimmed);
        console.log('URL:', urlStr);
        console.log('Method:', httpMethod);
        console.log('Headers:', headers);
        if (body) console.log('Body:', body);
    }

    let res;
    try {
        res = await fetch(urlStr, {
            method: httpMethod,
            body: body,
            headers: headers,
            agent: agent,
            redirect: noFollow ? 'manual' : 'follow'
        });
    } catch (err) {
        console.error(`Error: request for line "${trimmed}" failed: ${err}`);
        process.exit(1);
    }

    if (failCodes.has(res.status)) {
        console.error(`Error: request for line "${trimmed}" failed with status ${res.status}`);
        console.error('Response Headers:', Object.fromEntries(res.headers.entries()));
        process.exit(1);
    }

    if (debug) {
        console.log('Response Status:', res.status);
        console.log('Response Headers:', Object.fromEntries(res.headers.entries()));
        console.log('-------------');
    }

    if (res.status == 200 && outputFolder) {
        const outputPath = getOutputPath(trimmed);
        const responseBody = await res.text();
        fs.writeFileSync(outputPath, responseBody);
    }

    if (markerPath) {
        fs.writeFileSync(markerPath, '');
    }

    console.log(`${new Date().toISOString()} ${httpMethod} ${res.status} ${trimmed}`);
}

// ---- WORKER POOL ----
async function worker(queue) {
    while (true) {
        const line = queue.shift();
        if (line === undefined) break;
        await processLine(line);
    }
}

// ---- PROCESS FILES ----
async function processFile(filePath) {
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    const queue = [];
    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        queue.push(trimmed);
    }

    const workers = [];
    for (let i = 0; i < numWorkers; i++) {
        workers.push(worker(queue));
    }
    await Promise.all(workers);
}

// ---- PROCESS ALL FILES ----
async function processAllFiles() {
    for (const f of filePaths) {
        if (!fs.existsSync(f)) {
            console.error(`File not found: ${f}`);
            process.exit(1);
        }
        await processFile(f);
    }
    console.log('DONE');
    process.exit(0);
}

processAllFiles().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

