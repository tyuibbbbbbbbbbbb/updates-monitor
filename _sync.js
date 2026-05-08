const { execSync } = require("child_process");

function run(c) {
  console.log("\n>", c);
  try { console.log(execSync(c, { encoding: "utf8" })); }
  catch (e) { console.log("STDOUT:", e.stdout, "\nSTDERR:", e.stderr); }
}

// שלב 1: דחיפה
run('git stash push -u -m auto');
run('git pull --rebase');
run('git stash pop');
run('git add -A');
run('git diff --cached --quiet || git commit -m "Improve junk text cleaning in scraper"');
run('git push');
run('gh workflow run scrape.yml');
