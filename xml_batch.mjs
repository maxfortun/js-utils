#!/usr/bin/env node
import fs from 'fs';
import xpath from 'xpath';
import { DOMParser, XMLSerializer } from 'xmldom';

const scriptName = process.argv[1];

if (process.argv.length < 3) {
    console.error(`Usage: node ${scriptName} <list-of-files> <xpath1> <xpath2> ...`);
    process.exit(1);
}

const listFile = process.argv[2];
const xpaths = process.argv.slice(3);

if (xpaths.length === 0) {
    console.error(`Error: At least one XPath must be provided.`);
    process.exit(1);
}

let files;
try {
    files = fs.readFileSync(listFile, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean);
} catch (err) {
    console.error(`Failed to read file list: ${err.message}`);
    process.exit(1);
}

const serializer = new XMLSerializer();

for (const file of files) {
    try {
        const xml = fs.readFileSync(file, 'utf-8');

        // Parse XML, handle errors and warnings
        const doc = new DOMParser({
            errorHandler: {
                warning: (msg) => {
                    // Try to extract line/column if provided
                    const match = msg.match(/@#\[line:(\d+),col:(\d+)\]/);
                    if (match) {
                        console.warn(`[WARNING] File: ${file}, Line: ${match[1]}, Col: ${match[2]}, Message: ${msg}`);
                    } else {
                        console.warn(`[WARNING] File: ${file}, Message: ${msg}`);
                    }
                },
                error: (msg) => {
                    const match = msg.match(/@#\[line:(\d+),col:(\d+)\]/);
                    if (match) {
                        console.error(`[ERROR] File: ${file}, Line: ${match[1]}, Col: ${match[2]}, Message: ${msg}`);
                    } else {
                        console.error(`[ERROR] File: ${file}, Message: ${msg}`);
                    }
                },
                fatalError: (msg) => {
                    const match = msg.match(/@#\[line:(\d+),col:(\d+)\]/);
                    if (match) {
                        console.error(`[FATAL] File: ${file}, Line: ${match[1]}, Col: ${match[2]}, Message: ${msg}`);
                    } else {
                        console.error(`[FATAL] File: ${file}, Message: ${msg}`);
                    }
                }
            }
        }).parseFromString(xml, 'text/xml');

        const lineValues = [];

        for (const path of xpaths) {
            const nodes = xpath.select(path, doc);

            if (!nodes || nodes.length === 0) {
                lineValues.push('');
                continue;
            }

            const values = nodes.map(node => {
                switch (node.nodeType) {
                    case 1: return serializer.serializeToString(node); // ELEMENT_NODE
                    case 2: return node.nodeValue;                      // ATTRIBUTE_NODE
                    case 3: return node.nodeValue;                      // TEXT_NODE
                    default: return '';
                }
            }).filter(v => v !== '');

            lineValues.push(values.join(','));
        }

        process.stdout.write(lineValues.join('\t') + '\n');

    } catch (err) {
        console.error(`[ERROR] File: ${file}, Exception: ${err.message}`);
    }
}

