import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "bundle");
const push = process.argv.includes("--push");

function run(command, args, cwd) {
  const windowsNpm = command === "npm" && process.platform === "win32";
  const executable = windowsNpm ? process.env.ComSpec || "cmd.exe" : command;
  const commandArgs = windowsNpm
    ? ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  if (capture("git", ["branch", "--show-current"], root) !== "main") {
    throw new Error("Run this script from a main checkout.");
  }
  if (!await exists(path.join(bundle, ".git"))) {
    throw new Error("The bundle submodule must be added before building the bundle.");
  }

  run("git", ["submodule", "update", "--init", "--remote", "backend", "frontend", "cli"], root);

  const frontend = path.join(root, "frontend");
  run("npm", ["install"], frontend);
  run("npm", ["run", "build"], frontend);

  const publicDir = path.join(bundle, "public");
  const generatedFiles = [
    ".env",
    ".dockerignore",
    "Dockerfile",
    "cli.js",
    "package.json",
    "railway.json",
    "server.js",
  ];
  for (const file of generatedFiles) {
    await rm(path.join(bundle, file), { force: true });
  }
  await rm(publicDir, { recursive: true, force: true });

  const indexFile = path.join(frontend, "dist", "snip-frontend", "browser", "index.html");
  if (!await exists(indexFile)) {
    throw new Error(`Angular build output is missing: ${indexFile}`);
  }

  await mkdir(publicDir, { recursive: true });
  await cp(path.join(frontend, "dist", "snip-frontend", "browser"), publicDir, {
    recursive: true,
  });
  await cp(path.join(root, "backend", "server.js"), path.join(bundle, "server.js"));
  await cp(path.join(root, "cli", "cli.js"), path.join(bundle, "cli.js"));
  await writeFile(path.join(bundle, ".env"), "PUBLIC_DIR=./public\n");
  await writeFile(
    path.join(bundle, "package.json"),
    `${JSON.stringify({ name: "snip-bundle", private: true, scripts: { start: "bun server.js" } }, null, 2)}\n`,
  );
  await writeFile(
    path.join(bundle, "Dockerfile"),
    [
      "FROM oven/bun:1-alpine",
      "WORKDIR /app",
      "COPY . .",
      "ENV PORT=3000",
      "EXPOSE 3000",
      'CMD ["bun", "server.js"]',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(bundle, ".dockerignore"),
    [".git", ".gitmodules", "node_modules", "npm-debug.log", ""].join("\n"),
  );
  await writeFile(
    path.join(bundle, "railway.json"),
    `${JSON.stringify({
      $schema: "https://railway.app/railway.schema.json",
      build: { builder: "DOCKERFILE" },
      deploy: { healthcheckPath: "/api/links", healthcheckTimeout: 100 },
    }, null, 2)}\n`,
  );

  run("npm", ["test"], path.join(root, "cli"));

  run("git", ["add", "-A"], bundle);
  const bundleDiff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: bundle });
  if (bundleDiff.status === 1) {
    run(
      "git",
      [
        "commit",
        "-m",
        "Build generated Snip bundle",
        "-m",
        "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
        "-m",
        "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
      ],
      bundle,
    );
    console.log("Committed generated bundle.");
  } else if (bundleDiff.status === 0) {
    console.log("Bundle unchanged.");
  } else {
    throw new Error("Unable to inspect staged bundle changes.");
  }

  run("git", ["add", "bundle"], root);
  const mainDiff = spawnSync("git", ["diff", "--cached", "--quiet", "--", "bundle"], {
    cwd: root,
  });
  if (mainDiff.status === 1) {
    run(
      "git",
      [
        "commit",
        "-m",
        "Bump generated bundle submodule",
        "-m",
        "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
        "-m",
        "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
      ],
      root,
    );
    console.log("Committed bundle gitlink update.");
  } else if (mainDiff.status === 0) {
    console.log("Bundle gitlink unchanged.");
  } else {
    throw new Error("Unable to inspect staged bundle gitlink changes.");
  }

  if (push) {
    run("git", ["push", "origin", "HEAD:bundle"], bundle);
    run("git", ["push", "origin", "main"], root);
    console.log("Pushed bundle and main.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
