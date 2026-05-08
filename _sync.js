const { execSync } = require("child_process");
const fs = require("fs");

function run(c) {
  console.log("\n>", c);
  try { console.log(execSync(c, { encoding: "utf8" })); }
  catch (e) { console.log("STDOUT:", e.stdout, "\nSTDERR:", e.stderr); }
}

// ניקוי קבצי עזר
for (const f of ["_verify.js", "_check.js", "_wait.js", "_wait2.js", "_analyze.js", "_sync2.js", "_push.js", "_push.bat", "_create_repo.bat"]) {
  try { fs.unlinkSync(f); console.log("rm", f); } catch {}
}

// הסרה מ-git + commit + push
run('git rm --cached _verify.js 2>nul || echo ok');
run('git add -A');
run('git diff --cached --quiet || git commit -m "Remove helper scripts, add gitignore for _* files"');
run('git push');
