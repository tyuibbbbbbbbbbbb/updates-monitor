const { execSync } = require("child_process");
const fs = require("fs");

// מחיקת קבצי עזר
for (const f of ["_push.bat", "_push.js", "_check.js", "_create_repo.bat", "_analyze.js", "_wait.js", "_wait2.js", "_sync2.js"]) {
  try { fs.unlinkSync(f); console.log("rm", f); } catch {}
}

const cmds = [
  'git stash push -u -m "helpers"',
  'git pull --rebase',
  'git stash pop',
  'git add -A',
  'git diff --cached --quiet || git commit -m "Local helpers"',
  'git push',
  'gh workflow run scrape.yml',
];
for (const c of cmds) {
  console.log("\n>", c);
  try {
    console.log(execSync(c, { encoding: "utf8" }));
  } catch (e) {
    console.log("STDOUT:", e.stdout);
    console.log("STDERR:", e.stderr);
  }
}
