const { execSync } = require("child_process");
const fs = require("fs");

// מחיקת קבצי עזר
for (const f of ["_push.bat", "_push.js", "_check.js", "_create_repo.bat"]) {
  try { fs.unlinkSync(f); console.log("rm", f); } catch {}
}

const cmds = [
  'git pull --rebase',
  'git add -A',
  'git commit -m "Add debug HTML dump when no items found"',
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
