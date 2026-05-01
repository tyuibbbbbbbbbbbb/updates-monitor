const { execSync } = require("child_process");
console.log("ממתין 120 שניות לסיום ה-workflow (Puppeteer + Chrome install)...");
setTimeout(() => {
  try {
    console.log(execSync("gh run list --workflow=scrape.yml --limit 3", { encoding: "utf8" }));
    console.log("\n--- pull ---");
    console.log(execSync("git pull --rebase", { encoding: "utf8" }));
  } catch (e) {
    console.log("ERR:", e.message);
    if (e.stdout) console.log("STDOUT:", e.stdout.toString());
    if (e.stderr) console.log("STDERR:", e.stderr.toString());
  }
}, 120000);
