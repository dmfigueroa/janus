// Installs simple-git-hooks in a normal checkout. Linked worktrees keep `.git`
// as a file and share the main checkout's hooks, so installing there fails with
// ENOTDIR and would abort `npm ci`.
const { execFileSync } = require("node:child_process");
const { statSync } = require("node:fs");

function gitDirectoryExists() {
  try {
    return statSync(".git").isDirectory();
  } catch {
    return false;
  }
}

if (!gitDirectoryExists()) {
  console.log("Skipping git hook installation: linked worktree uses the main checkout's hooks.");
  process.exit(0);
}

execFileSync("simple-git-hooks", { stdio: "inherit" });
