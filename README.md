# Snip CLI

Requires Node.js 20 or later and the Snip backend. Run `node cli.js help`,
or use the `snip`, `snip.cmd`, or `snip.ps1` wrapper for your shell.

```text
snip add https://example.com
snip ls
snip open abc123
```

Set `SNIP_API` to the backend origin; it defaults to `http://localhost:3000`.
Errors go to stderr with exit code 1. Requests time out after 10 seconds.
`open` asks the server for a redirect and opens the destination in the default
browser. On Windows it uses the standard URL handler without a command shell;
macOS uses `open` and Linux uses `xdg-open`.

Run `npm test` for the CLI tests.
