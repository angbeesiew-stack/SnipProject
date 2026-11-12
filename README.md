# Snip frontend

Angular 21 client for the Snip URL shortener. It uses the shared API at
`http://localhost:3000` by default.

## Run locally

```sh
npm install
npm start
```

Open `http://localhost:4200`. The Bun backend must be running on port `3000`.

## API contract

- `POST /api/links` with `{ "url": "https://…" }` creates a link and returns
  `{ code, url, shortUrl, hits, createdAt }`.
- `GET /api/links` returns the link list.

## Verify

```sh
npm test -- --watch=false
npm run build
```

The production browser app is emitted to `dist/snip-frontend/browser`.
