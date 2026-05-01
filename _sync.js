const { execSync } = require("child_process");
const fs = require("fs");

const cmds = [
  'git stash push -u -m auto',
  'git pull --rebase',
  'git stash pop',
  'git add -A',
  'git diff --cached --quiet || git commit -m "Clean filter for message content"',
  'git push',
  'gh workflow run scrape.yml',
  'gh run list --workflow=scrape.yml --limit 3',
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
