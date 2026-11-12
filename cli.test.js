'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { openBrowser } = require('./cli');

const cli = path.join(__dirname, 'cli.js');

function run(args, base) {
  return runNode([cli, ...args], base);
}

function runNode(args, base) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, SNIP_API: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('commands use the API contract and report errors', async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        assert.deepEqual(JSON.parse(body), { url: 'https://example.com/' });
        res.writeHead(201).end(JSON.stringify({ shortUrl: 'http://localhost/abc123' }));
      });
    } else if (req.url === '/api/links') {
      res.end(JSON.stringify([{ code: 'abc123', hits: 12, url: 'https://example.com/' }]));
    } else {
      res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const help = await run(['help'], base);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /snip add <url>/);
  const add = await run(['add', 'https://example.com/'], base);
  assert.equal(add.code, 0);
  assert.equal(add.stdout.trim(), 'http://localhost/abc123');
  const ls = await run(['ls'], base);
  assert.equal(ls.code, 0);
  assert.match(ls.stdout, /abc123\s+12\s+https:\/\/example\.com\//);
  const missing = await run(['open', 'abc123'], base);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /404.*Not found/);
  const invalid = await run(['add', 'ftp://example.com'], base);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /HTTP\(S\)/);
  assert.deepEqual(requests, ['POST /api/links', 'GET /api/links', 'GET /abc123']);
  const extra = await run(['ls', 'extra'], base);
  assert.equal(extra.code, 1);
  assert.match(extra.stderr, /Invalid arguments/);
});

test('empty list and unreachable backend', async (t) => {
  const server = http.createServer((req, res) => res.end('[]'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const empty = await run(['ls'], base);
  assert.equal(empty.stdout.trim(), 'No links yet.');
  assert.equal(empty.code, 0);
  await new Promise((resolve) => server.close(resolve));
  const dead = await run(['ls'], base);
  assert.equal(dead.code, 1);
  assert.match(dead.stderr, /Could not reach API/);
  assert.equal(dead.stdout, '');
});

test('open requests a manual redirect and launches its target', async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(302, { location: 'https://example.com/?a=1&b=2' }).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const script = `
    const { EventEmitter } = require('node:events');
    require('node:child_process').spawn = (command, args) => {
      console.log(JSON.stringify({ command, args }));
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 0));
      return child;
    };
    require(${JSON.stringify(cli)}).main(['open', 'abc123']).catch(error => {
      console.error(error.message); process.exitCode = 1;
    });
  `;
  const result = await runNode(['-e', script], base);
  assert.equal(result.code, 0, result.stderr);
  const launched = JSON.parse(result.stdout);
  assert.equal(launched.args.at(-1), 'https://example.com/?a=1&b=2');
  assert.deepEqual(requests, ['/abc123']);
});

test('request times out', { timeout: 15000 }, async (t) => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await run(['ls'], `http://127.0.0.1:${server.address().port}`);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /timed out/);
});

test('browser launcher uses platform handlers and reports failures', async () => {
  const calls = [];
  const fakeSpawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };
  const target = 'https://example.com/?a=1&b=2';
  await openBrowser(target, 'win32', fakeSpawn);
  await openBrowser(target, 'darwin', fakeSpawn);
  await openBrowser(target, 'linux', fakeSpawn);
  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ['rundll32.exe', ['url.dll,FileProtocolHandler', target]],
    ['open', [target]],
    ['xdg-open', [target]],
  ]);
  const failedSpawn = () => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit('error', new Error('not found')));
    return child;
  };
  await assert.rejects(openBrowser(target, 'linux', failedSpawn), /not found/);
});
