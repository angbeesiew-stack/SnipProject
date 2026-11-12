#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open a link in the default browser
  snip help         Show this help

Set SNIP_API to the API base URL (default: http://localhost:3000).`;

function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
  return url;
}

async function request(base, path, options = {}) {
  let response;
  try {
    response = await fetch(new URL(path, base), {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('API request timed out.');
    throw new Error(`Could not reach API: ${error.message}`);
  }
  if (!response.ok && !(options.redirect === 'manual' && response.status === 302)) {
    const body = await response.text();
    let detail;
    try {
      const parsed = JSON.parse(body);
      detail = parsed && parsed.error;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new Error(`API returned HTTP ${response.status}${typeof detail === 'string' ? `: ${detail}` : '.'}`);
  }
  return response;
}

function openBrowser(url, platform = process.platform, spawnProcess = spawn) {
  let command;
  let args;
  if (platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: 'ignore' });
    child.once('error', (error) => reject(new Error(`Could not open browser: ${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Browser launcher failed (exit ${code}).`));
    });
  });
}

async function main(args) {
  const [command, value] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (args.length > 1) throw new Error('Help takes no arguments.');
    console.log(USAGE);
    return;
  }
  if (!['add', 'ls', 'open'].includes(command)) throw new Error(`Unknown command: ${command}`);
  if ((command === 'ls' && args.length !== 1) || (command !== 'ls' && args.length !== 2)) {
    throw new Error(`Invalid arguments for ${command}. Run snip help.`);
  }
  if (command === 'add') httpUrl(value, 'URL');
  if (command === 'open' && !/^[a-zA-Z0-9]{6}$/.test(value)) {
    throw new Error('Code must contain exactly six letters or digits.');
  }
  const base = httpUrl(process.env.SNIP_API || 'http://localhost:3000', 'SNIP_API');

  if (command === 'add') {
    const response = await request(base, '/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: value }),
    });
    const link = await response.json();
    if (typeof link.shortUrl !== 'string') throw new Error('API response is missing shortUrl.');
    console.log(link.shortUrl);
  } else if (command === 'ls') {
    const response = await request(base, '/api/links');
    const links = await response.json();
    if (!Array.isArray(links)) throw new Error('API response is not a link list.');
    if (links.length === 0) {
      console.log('No links yet.');
      return;
    }
    const codeWidth = Math.max(4, ...links.map((link) => String(link.code).length));
    const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
    console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
    for (const link of links) {
      console.log(`${String(link.code).padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`);
    }
  } else {
    const response = await request(base, `/${value}`, { redirect: 'manual' });
    if (response.status !== 302) throw new Error(`Expected a redirect, got HTTP ${response.status}.`);
    const location = response.headers.get('location');
    if (!location) throw new Error('API redirect is missing Location.');
    const target = httpUrl(new URL(location, base).href, 'Redirect target');
    await openBrowser(target.href);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, openBrowser };
