# Cycling Calendar Scraper

Scrapes rider calendar data from ProCyclingStats and (optionally) UCI.

## Setup

```bash
npm install
```

## ProCyclingStats (HTML scrape)

```bash
node scrape-rider.js --source procyclingstats --rider isaac-del-toro --out rider-calendar.json
```

## Batch scrape

```bash
node batch-scrape.js --source procyclingstats --riders "tadej-pogacar,jonas-vingegaard,remco-evenepoel" --out rider-calendars.json
```

Or from a file (one per line):

```bash
node batch-scrape.js --source procyclingstats --riders-file riders.txt --out rider-calendars.json
```

Optional flags:

- `--delay 2000` delay (ms) between riders
- `--min-delay 1500` minimum delay (ms) between requests
- `--per-rider-dir data/riders` write a JSON file per rider
- `--ndjson data/riders.ndjson` write newline-delimited JSON output
- `--pcs-browser true` use Playwright for PCS (helpful if 403)
- `--headless false` show browser window

For UCI batch, use `--urls` or `--urls-file` with rider page URLs.

## UCI (dynamic site)

The UCI site is rendered client-side, so this scraper uses Playwright.

```bash
npm install playwright
npx playwright install
node scrape-rider.js --source uci --url "https://www.uci.org/your-rider-url" --out rider-calendar.json
```

You can also control the browser engine for UCI:

```bash
UCI_BROWSER_ENGINE=webkit node scrape-rider.js --source uci --url "https://www.uci.org/your-rider-url"
```

### Rate limiting and retries

Defaults are set to be respectful. You can override with env vars:

```bash
SCRAPE_MIN_DELAY_MS=1500 SCRAPE_MAX_RETRIES=3 SCRAPE_BACKOFF_BASE_MS=1000 node scrape-rider.js --source procyclingstats --rider isaac-del-toro
```

If PCS returns 403s, enable the browser fallback:

```bash
PCS_USE_BROWSER=true node scrape-rider.js --source procyclingstats --rider isaac-del-toro
```

If Playwright crashes on macOS, try a different engine or a system Chrome build:

```bash
# Use WebKit instead of Chromium
PCS_USE_BROWSER=true PCS_BROWSER_ENGINE=webkit node scrape-rider.js --source procyclingstats --rider isaac-del-toro

# Use system Chrome if installed
PCS_USE_BROWSER=true PCS_BROWSER_CHANNEL=chrome node scrape-rider.js --source procyclingstats --rider isaac-del-toro

# Or specify an explicit executable path
PCS_USE_BROWSER=true PCS_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scrape-rider.js --source procyclingstats --rider isaac-del-toro
```

## Output shape

```json
{
  "rider": {
    "name": "Isaac del Toro",
    "team": "UAE Team Emirates"
  },
  "calendar": [
    {
      "date": "24.01",
      "raceName": "Vuelta a San Juan",
      "raceLink": "https://www.procyclingstats.com/race/vuelta-a-san-juan/2026",
      "result": "Upcoming"
    }
  ],
  "scrapedAt": "2026-01-16T02:04:23.000Z",
  "source": "procyclingstats"
}
```

## Web app (Next.js + Supabase + Prisma)

### Setup

1. Create a Supabase project and copy the Postgres connection string.
2. Set `DATABASE_URL` in your environment (Vercel and local).
3. Install dependencies and generate Prisma client:

```bash
npm install
```

### Database schema

```bash
npx prisma db push
```

### Seed data from local JSON files

```bash
npm run db:seed
```

### Run the site

```bash
npm run dev
```
