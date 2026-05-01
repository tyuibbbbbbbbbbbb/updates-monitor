const fs = require("fs");
const cheerio = require("cheerio");

for (const f of ["data/debug-hagizra.html", "data/debug-blackcat.html"]) {
  console.log("\n========", f, "========");
  const html = fs.readFileSync(f, "utf8");
  const $ = cheerio.load(html);

  // Element classes counts
  const classCount = new Map();
  $("*").each((_, el) => {
    const cls = ($(el).attr("class") || "").split(/\s+/).filter(Boolean);
    for (const c of cls) classCount.set(c, (classCount.get(c) || 0) + 1);
  });
  // Custom Angular components (app-*)
  const compCount = new Map();
  $("*").each((_, el) => {
    const tag = el.tagName || el.name;
    if (tag && /^app-/i.test(tag)) compCount.set(tag, (compCount.get(tag) || 0) + 1);
  });

  console.log("\n--- Angular components (app-*) ---");
  [...compCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log("\n--- Top repeated classes (count>=3, name contains message/post/item/card/channel) ---");
  [...classCount.entries()]
    .filter(([k, v]) => v >= 3 && /(message|post|item|card|channel|topic|feed|content|update)/i.test(k))
    .sort((a, b) => b[1] - a[1]).slice(0, 30)
    .forEach(([k, v]) => console.log(`  .${k}: ${v}`));

  // Look for elements with attribute starting "_ngcontent" that have many siblings
  console.log("\n--- Elements with same class, count >= 5 ---");
  [...classCount.entries()]
    .filter(([k, v]) => v >= 5 && k.length > 2 && !/^(text|font|flex|w-|h-|p-|m-|gap-|bg-|border|rounded|absolute|relative|inset|opacity|cursor|transition|truncate|line-clamp|justify|items|max-|min-|md:|sm:|lg:|hover|focus|sr-only|hidden|block|inline)/.test(k))
    .sort((a, b) => b[1] - a[1]).slice(0, 30)
    .forEach(([k, v]) => console.log(`  .${k}: ${v}`));
}
