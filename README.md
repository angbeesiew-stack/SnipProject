# Snip

Snip is a small URL shortener with one API and two clients: an Angular web app and a Node.js CLI. The backend deliberately stores links in memory, so a server restart clears them.

## Repository layout

| Branch | Contents |
| --- | --- |
| `backend` | Bun API server |
| `frontend` | Angular 19 web app |
| `cli` | Zero-dependency CommonJS CLI |
| `bundle` | Generated release: API, built UI, CLI, and Dockerfile |
| `main` | Superproject mounting the other branches as submodules |

Clone with submodules initialized:

```sh
git clone --recurse-submodules https://github.com/angbeesiew-stack/SnipProject.git
```

Plain clones leave the submodule directories empty. If already cloned, run `git submodule update --init --recursive`.

## API contract

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://…" }` → `201 { code, url, shortUrl, hits, createdAt }`; invalid JSON or a non-HTTP(S) URL → `400 { error }` |
| `GET` | `/api/links` | `200` with all link objects |
| `GET` | `/:code` | `302` to the original URL and increments `hits`; `404` when unknown |

## Run from `main`

Start each component in its own terminal:

```sh
cd backend && bun start
cd frontend && npm install && npx ng serve
cd cli && node cli.js ls
```

The backend listens on port 3000 by default; the Angular development server uses port 4200. Both clients call the backend at `http://localhost:3000`.

## Bundle and release

`bundle/` is generated from the latest `backend`, `frontend`, and `cli` branch tips by `node scripts/build-bundle.mjs`. It updates the bundle branch and its `main` gitlink locally; add `--push` to publish those changes. The script is designed to be idempotent, so repeating it without source changes is a no-op.

The bundle workflow runs hourly or manually, not on push: source branch pushes do not trigger a workflow that exists only on `main`. The Docker workflow watches the `bundle` gitlink on `main` and can also be started manually. Because an Actions push made with `GITHUB_TOKEN` does not trigger a second push workflow, the bundle workflow explicitly dispatches the Docker workflow after its push.

## Updating a component

Commit and push changes from inside that component's checkout, then update and commit the submodule pointer from `main`:

```sh
cd backend
git add -A && git commit -m "Describe backend change" && git push
cd ..
git submodule update --remote backend
git add backend && git commit -m "Bump backend submodule" && git push
node scripts/build-bundle.mjs --push
```

Repeat with `frontend` or `cli` as appropriate. `bundle` is generated output: do not hand-edit it. The CLI must remain CommonJS, and the Angular output location `dist/snip-frontend/browser` is used by the bundle builder.
