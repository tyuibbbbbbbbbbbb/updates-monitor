const { execSync } = require("child_process");
const fs = require("fs");

console.log("ממתין 90 שניות...");
setTimeout(() => {
  try {
    console.log(execSync("gh run list --workflow=scrape.yml --limit 2", { encoding: "utf8" }));
    execSync("git stash push -u -m auto2", { stdio: "pipe" });
    execSync("git pull --rebase", { stdio: "pipe" });
    try { execSync("git stash pop", { stdio: "pipe" }); } catch {}
    const j = JSON.parse(fs.readFileSync("data/updates.json", "utf8"));
    console.log(`\n=== items: ${j.items.length}, errors: ${j.errors.length} ===`);
    for (const it of j.items.slice(0, 5)) {
      console.log(`\n[${it.sourceName}] ${(it.title || "").slice(0, 100)}`);
      console.log(`  body: ${(it.body || "").slice(0, 150)}`);
    }
  } catch (e) {
    console.log("ERR:", e.message);
  }
}, 90000);
