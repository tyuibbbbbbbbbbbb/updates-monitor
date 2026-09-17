# mitmachim.top forum scraper

Downloads the **entire content** of the [mitmachim.top](https://mitmachim.top)
NodeBB forum through its public read API and saves it as structured JSON on
disk.

Instead of scraping raw HTML, it uses NodeBB's JSON API (mitmachim.top runs on
NodeBB), which is faster, more reliable and returns clean structured data:

| Data          | Endpoint                                   |
| ------------- | ------------------------------------------ |
| Categories    | `GET /api/categories`                      |
| Topics (list) | `GET /api/category/{cid}?page=N`           |
| Posts         | `GET /api/topic/{tid}?page=N`              |

## Requirements

- **Node.js >= 18** (uses the built-in global `fetch` — there are **no npm
  dependencies to install**).

## Usage

```bash
cd mitmachim-scraper

# Full scrape of the whole forum into ./data
node scrape.js

# Scrape only specific categories, cap the number of topics, download media
node scrape.js --categories 66,71 --max-topics 100 --media

# Custom output directory + gentler rate limit
node scrape.js --out /path/to/output --delay 800
```

You can also run it via npm:

```bash
npm run scrape -- --media
```

### Options

| Flag                 | Default  | Description                                             |
| -------------------- | -------- | ------------------------------------------------------- |
| `--out <dir>`        | `./data` | Output directory                                        |
| `--delay <ms>`       | `500`    | Delay between requests (rate limiting)                  |
| `--retries <n>`      | `4`      | Retry attempts per request (exponential backoff)        |
| `--timeout <ms>`     | `45000`  | Per-request timeout                                     |
| `--max-topics <n>`   | `0`      | Stop after fetching N topics total; also caps how many are listed per category (`0` = no limit) |
| `--categories <ids>` | all      | Comma-separated category ids to scrape (e.g. `66,71`)   |
| `--concurrency <n>`  | `1`      | Number of topics fetched in parallel                    |
| `--media`            | off      | Download referenced media (images/files) to `media/`    |
| `--force`            | off      | Re-scrape topics even if already saved                  |
| `-h`, `--help`       |          | Show help                                               |

## Output layout

Everything is written under the output directory (default `./data`, which is
git-ignored):

```
data/
├── categories.json        # full category tree + flattened list
├── categories/
│   └── {cid}.json         # topic index for each category
├── topics/
│   └── {tid}.json         # one file per topic, with ALL its posts
├── media/                 # downloaded media (only with --media)
│   └── {hash}.{ext}
└── progress.json          # resume state (completed topic ids)
```

### Topic file shape (`topics/{tid}.json`)

```jsonc
{
  "tid": 98637,
  "title": "...",
  "slug": "98637/...",
  "cid": 66,
  "category": { "cid": 66, "name": "כללי - עזרה הדדית", "slug": "66/..." },
  "postcount": 123,
  "viewcount": 4567,
  "timestampISO": "2026-06-28T15:50:08.071Z",
  "tags": ["..."],
  "scrapedAt": "2026-07-19T21:04:15.000Z",
  "posts": [
    {
      "pid": 1206310,
      "index": 0,
      "author": { "uid": 3408, "username": "...", "displayname": "..." },
      "content": "<p>rendered HTML content ...</p>",
      "timestampISO": "2026-06-28T15:50:08.071Z",
      "editedISO": "...",
      "upvotes": 3,
      "uploads": [],
      "attachments": []
    }
  ]
}
```

## Behaviour notes

- **Rate limiting** — requests are spaced out by `--delay` (default 500 ms) so
  the server is not overloaded.
- **Retry on failure** — transient errors and `429`/`5xx` responses are retried
  with exponential backoff; permanent `4xx` errors are not retried.
- **Pagination** — both the category topic lists and the posts within a topic
  are fully paginated using NodeBB's `pagination.pageCount`.
- **Resumable** — completed topic ids are recorded in `progress.json`, so
  re-running the script continues where it left off. Use `--force` to redo.
- **Media** — with `--media`, images/files referenced in post content and in the
  `uploads`/`attachments` fields are mirrored into `media/` (only assets hosted
  on `mitmachim.top`; emoji sprites are skipped). Missing files (`404`) are
  logged and skipped.
- **NetFree filter** — like `updates-monitor/scraper.js`, the script detects the
  NetFree block page. If the network is filtered it exits with code `2` and a
  clear message; run it from an open network or a cloud environment.

## Exit codes

| Code | Meaning                          |
| ---- | -------------------------------- |
| `0`  | Success                          |
| `1`  | Fatal error                      |
| `2`  | Network blocked (NetFree filter) |
