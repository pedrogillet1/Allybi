import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function resolveGitDir(rootDir) {
  const gitPath = path.join(rootDir, ".git");
  if (!fs.existsSync(gitPath)) return null;
  const stat = fs.statSync(gitPath);
  if (stat.isDirectory()) return gitPath;
  const content = readText(gitPath);
  if (!content) return null;
  const match = content.match(/gitdir:\s*(.+)\s*$/i);
  if (!match) return null;
  const candidate = match[1].trim();
  if (!candidate) return null;
  return path.resolve(rootDir, candidate);
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveFromGitFiles(rootDir) {
  const gitDir = resolveGitDir(rootDir);
  if (!gitDir) return null;
  const head = readText(path.join(gitDir, "HEAD"));
  if (!head) return null;
  const trimmedHead = head.trim();
  if (!trimmedHead) return null;

  if (trimmedHead.startsWith("ref:")) {
    const refPath = trimmedHead.replace(/^ref:\s*/, "").trim();
    if (!refPath) return null;
    const refValue = readText(path.join(gitDir, refPath));
    const refHash = String(refValue || "")
      .trim()
      .toLowerCase();
    if (/^[0-9a-f]{40}$/.test(refHash)) return refHash;

    const packedRefs = readText(path.join(gitDir, "packed-refs"));
    if (!packedRefs) return null;
    const lines = packedRefs.split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith("#") || line.startsWith("^")) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const [hash, ref] = parts;
      if (ref === refPath && /^[0-9a-f]{40}$/i.test(hash)) {
        return hash.toLowerCase();
      }
    }
    return null;
  }

  const detached = trimmedHead.toLowerCase();
  return /^[0-9a-f]{40}$/.test(detached) ? detached : null;
}

function resolveFromGitExecutable(rootDir) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const hash = String(result.stdout || "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{40}$/.test(hash) ? hash : null;
}

export function resolveCommitHash(rootDir = process.cwd()) {
  const fromEnv = String(process.env.GIT_COMMIT_HASH || "")
    .trim()
    .toLowerCase();
  if (/^[0-9a-f]{40}$/.test(fromEnv)) {
    return { commitHash: fromEnv, source: "env" };
  }

  const fromGitExecCwd = resolveFromGitExecutable(rootDir);
  if (fromGitExecCwd) {
    return { commitHash: fromGitExecCwd, source: "git-exec-cwd" };
  }

  const repoRoot = findRepoRoot(rootDir) || rootDir;
  const fromGitFiles = resolveFromGitFiles(repoRoot);
  if (fromGitFiles) return { commitHash: fromGitFiles, source: "git-files" };

  const fromGitExecutable = resolveFromGitExecutable(repoRoot);
  if (fromGitExecutable) {
    return { commitHash: fromGitExecutable, source: "git-exec" };
  }

  return { commitHash: null, source: "none" };
}
