const { execSync } = require("child_process");
console.log("ממתין 60 שניות לסיום ה-workflow...");
setTimeout(() => {
  try {
    console.log(execSync("gh run list --workflow=scrape.yml --limit 3", { encoding: "utf8" }));
    console.log("\nמושך פלטים מהריפו...");
    console.log(execSync("git pull --rebase", { encoding: "utf8" }));
  } catch (e) {
    console.log("ERR:", e.message, e.stderr);
  }
}, 60000);
