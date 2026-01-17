import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  scrapeProCyclingStatsRiderCalendar,
  scrapeUciRiderCalendar,
  sleep,
} from './scrape-rider.js';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith('--')) {
      args.set(key.replace(/^--/, ''), value);
      i += 1;
    } else if (!args.has('source')) {
      args.set('source', key);
      i -= 1;
    }
  }
  return args;
}

function parseList(listValue) {
  if (!listValue) {
    return [];
  }
  return listValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseFileList(filePath) {
  if (!filePath) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function toSafeFilename(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function deriveIdentifier({ source, riderSlug, riderUrl, data }) {
  if (source === 'procyclingstats' && riderSlug) {
    return riderSlug;
  }

  if (source === 'uci' && riderUrl) {
    const pathSegment = riderUrl.split('/').filter(Boolean).pop();
    if (pathSegment) {
      return toSafeFilename(pathSegment);
    }
  }

  if (data?.rider?.name) {
    return toSafeFilename(data.rider.name);
  }

  return `rider-${Date.now()}`;
}

async function runBatch() {
  const args = parseArgs(process.argv);
  const source = args.get('source') || 'procyclingstats';
  const outputPath = args.get('out') || 'rider-calendars.json';
  const delayMs = Number(args.get('delay') ?? 2000);
  const minDelayMs = Number(args.get('min-delay') ?? 1500);
  const perRiderDir = args.get('per-rider-dir') || null;
  const ndjsonPath = args.get('ndjson') || null;
  const pcsBrowser = args.get('pcs-browser') === 'true';
  const headless = args.get('headless') !== 'false';

  const results = [];
  const errors = [];
  if (ndjsonPath) {
    const ndjsonDir = ndjsonPath.split('/').slice(0, -1).join('/');
    if (ndjsonDir) {
      fs.mkdirSync(ndjsonDir, { recursive: true });
    }
  }

  const ndjsonStream = ndjsonPath ? fs.createWriteStream(ndjsonPath) : null;

  let browser = null;

  try {
    if (source === 'procyclingstats') {
      const riders = [
        ...parseList(args.get('riders')),
        ...parseFileList(args.get('riders-file')),
      ];

      if (!riders.length) {
        throw new Error('Provide --riders or --riders-file for PCS batch scraping');
      }

      if (pcsBrowser) {
        let chromium;
        try {
          ({ chromium } = require('playwright'));
        } catch (error) {
          throw new Error(
            'Playwright is required for browser scraping. Install with: npm install playwright && npx playwright install'
          );
        }
        browser = await chromium.launch({ headless });
      }

      for (const [index, riderSlug] of riders.entries()) {
        try {
          const data = await scrapeProCyclingStatsRiderCalendar(riderSlug, {
            minDelayMs,
            useBrowser: pcsBrowser,
            headless,
            browser,
          });
          results.push(data);

          if (ndjsonStream) {
            ndjsonStream.write(`${JSON.stringify(data)}\n`);
          }

          if (perRiderDir) {
            fs.mkdirSync(perRiderDir, { recursive: true });
            const identifier = deriveIdentifier({ source, riderSlug, data });
            const filePath = `${perRiderDir}/${identifier}.json`;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          }
        } catch (error) {
          errors.push({ rider: riderSlug, error: error.message });
        }

        if (index < riders.length - 1) {
          await sleep(delayMs);
        }
      }
    } else if (source === 'uci') {
      const urls = [
        ...parseList(args.get('urls')),
        ...parseFileList(args.get('urls-file')),
      ];

      if (!urls.length) {
        throw new Error('Provide --urls or --urls-file for UCI batch scraping');
      }

      for (const [index, riderUrl] of urls.entries()) {
        try {
          const data = await scrapeUciRiderCalendar(riderUrl);
          results.push(data);

          if (ndjsonStream) {
            ndjsonStream.write(`${JSON.stringify(data)}\n`);
          }

          if (perRiderDir) {
            fs.mkdirSync(perRiderDir, { recursive: true });
            const identifier = deriveIdentifier({ source, riderUrl, data });
            const filePath = `${perRiderDir}/${identifier}.json`;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          }
        } catch (error) {
          errors.push({ url: riderUrl, error: error.message });
        }

        if (index < urls.length - 1) {
          await sleep(delayMs);
        }
      }
    } else {
      throw new Error(`Unknown source: ${source}`);
    }

    const payload = {
      scrapedAt: new Date().toISOString(),
      source,
      results,
      errors,
    };

    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

    console.log(`Saved batch output to ${outputPath}`);
    if (ndjsonPath) {
      console.log(`Saved NDJSON output to ${ndjsonPath}`);
    }
    if (perRiderDir) {
      console.log(`Saved per-rider files to ${perRiderDir}`);
    }
  } finally {
    if (ndjsonStream) {
      ndjsonStream.end();
    }
    if (browser) {
      await browser.close();
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  runBatch().catch((error) => {
    console.error('Batch scraping error:', error.message);
    process.exit(1);
  });
}
