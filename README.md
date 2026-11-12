# Snip backend

A zero-dependency Bun API for creating and resolving short links. Links are
stored in memory and are cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, or
`BASE_URL` to control the origin used in generated short links. If `BASE_URL`
is not set, `RAILWAY_PUBLIC_DOMAIN` is used with HTTPS when available;
otherwise links use `http://localhost:<PORT>`.

Set `PUBLIC_DIR` to serve static files alongside the API. `/` serves
`index.html`, and an existing static file takes precedence over a short code.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count.
