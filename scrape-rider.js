import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { fileURLToPath } from 'url';

const PCS_BASE_URL = 'https://www.procyclingstats.com';

const DEFAULT_RATE_LIMIT = {
  minDelayMs: 1500,
  maxRetries: 3,
  backoffBaseMs: 1000,
};

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function toAbsoluteUrl(baseUrl, maybeRelativeUrl) {
  if (!maybeRelativeUrl) {
    return null;
  }

  try {
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch (error) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTeamName(team) {
  if (!team) {
    return '';
  }

  return team
    .replace(/\s*-\s*[A-Z0-9]{2,}\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractPhotoUrl($) {
  const ogImage =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content');
  const profileImage =
    $('img[src*="images/riders/"]').first().attr('src') ||
    $('.riderPhoto img').attr('src') ||
    $('.rdrPic img').attr('src') ||
    $('.rdrpic img').attr('src') ||
    $('.riderPic img').attr('src') ||
    $('.riderPhoto').attr('data-src');
  const candidate = ogImage || profileImage;

  return toAbsoluteUrl(PCS_BASE_URL, candidate);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    throw new Error(
      'Playwright is required for browser scraping. Install with: npm install playwright && npx playwright install'
    );
  }
}

function resolvePlaywrightEngine(playwright, engineName) {
  return playwright[engineName] || playwright.default?.[engineName];
}

function parseBrowserArgs(value) {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  return String(value)
    .split(',')
    .map((arg) => arg.trim())
    .filter(Boolean);
}

function createRateLimiter(minDelayMs) {
  let lastRequestAt = 0;

  return {
    async wait() {
      if (!minDelayMs) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastRequestAt;
      const remaining = minDelayMs - elapsed;

      if (remaining > 0) {
        await sleep(remaining);
      }

      lastRequestAt = Date.now();
    },
  };
}

function shouldRetry(error) {
  const status = error?.response?.status;
  if (!status) {
    return true;
  }

  return status === 429 || status >= 500;
}

async function withRetries(task, { maxRetries, baseDelayMs }) {
  let attempt = 0;

  while (true) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 250);
      const delayMs = baseDelayMs * 2 ** attempt + jitter;
      console.warn(`Retrying after ${delayMs}ms...`);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

async function fetchHtml(url, { rateLimiter, retries } = {}) {
  if (rateLimiter) {
    await rateLimiter.wait();
  }

  return withRetries(
    async () => {
      const response = await axios.get(url, { headers: DEFAULT_HEADERS });
      return response.data;
    },
    {
      maxRetries: retries?.maxRetries ?? DEFAULT_RATE_LIMIT.maxRetries,
      baseDelayMs: retries?.baseDelayMs ?? DEFAULT_RATE_LIMIT.backoffBaseMs,
    }
  );
}

async function fetchHtmlWithPlaywright(url, options = {}) {
  const playwright = await loadPlaywright();

  const externalBrowser = options.browser;
  const engineName = (options.engine || 'chromium').toLowerCase();
  const engine = resolvePlaywrightEngine(playwright, engineName);

  if (!engine) {
    throw new Error(`Unsupported browser engine "${engineName}". Use chromium, firefox, or webkit.`);
  }

  const launchArgs = parseBrowserArgs(options.launchArgs);
  const launchOptions = {
    headless: options.headless !== false,
    channel: options.channel,
    executablePath: options.executablePath,
    args: launchArgs,
  };
  const browser = externalBrowser ?? (await engine.launch(launchOptions));
  const context = await browser.newContext({
    userAgent: DEFAULT_HEADERS['User-Agent'],
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const page = await context.newPage();

  try {
    page.setDefaultTimeout(20000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const consentButton = page.getByRole('button', { name: /accept|agree/i }).first();
    if (await consentButton.count()) {
      await consentButton.click({ timeout: 3000 }).catch(() => {});
    }

    try {
      await page.waitForSelector('table tbody tr', { timeout: 15000 });
    } catch (error) {
      console.warn('PCS table selector not found, continuing with raw HTML.');
    }

    const html = await page.content();

    const debugDir = options.debugDir || process.env.PCS_DEBUG_DIR;
    if (debugDir) {
      fs.mkdirSync(debugDir, { recursive: true });
      const safeName = url.split('/').filter(Boolean).pop() || 'page';
      await page.screenshot({ path: `${debugDir}/${safeName}.png`, fullPage: true });
      fs.writeFileSync(`${debugDir}/${safeName}.html`, html);
    }

    return html;
  } finally {
    await page.close();
    await context.close();
    if (!externalBrowser) {
      await browser.close();
    }
  }
}

async function scrapeProCyclingStatsRiderCalendar(riderSlug, options = {}) {
  const url = `${PCS_BASE_URL}/rider/${riderSlug}/calendar/calendar`;
  console.log(`Scraping PCS: ${url}`);

  const minDelayMs =
    options.minDelayMs ??
    Number(process.env.SCRAPE_MIN_DELAY_MS ?? DEFAULT_RATE_LIMIT.minDelayMs);
  const maxRetries =
    options.maxRetries ??
    Number(process.env.SCRAPE_MAX_RETRIES ?? DEFAULT_RATE_LIMIT.maxRetries);
  const baseDelayMs =
    options.backoffBaseMs ??
    Number(process.env.SCRAPE_BACKOFF_BASE_MS ?? DEFAULT_RATE_LIMIT.backoffBaseMs);
  const rateLimiter = createRateLimiter(minDelayMs);

  const useBrowser =
    options.useBrowser ??
    String(process.env.PCS_USE_BROWSER || '').toLowerCase() === 'true';

  let html;
  if (useBrowser) {
    html = await fetchHtmlWithPlaywright(url, {
      headless: options.headless,
      browser: options.browser,
      engine: options.browserEngine ?? process.env.PCS_BROWSER_ENGINE,
      channel: options.browserChannel ?? process.env.PCS_BROWSER_CHANNEL,
      executablePath:
        options.browserExecutablePath ?? process.env.PCS_BROWSER_EXECUTABLE_PATH,
      launchArgs: options.browserArgs ?? process.env.PCS_BROWSER_ARGS,
    });
  } else {
    try {
      html = await fetchHtml(url, {
        rateLimiter,
        retries: {
          maxRetries,
          baseDelayMs,
        },
      });
    } catch (error) {
      if (error?.response?.status === 403) {
        console.warn('PCS returned 403, retrying with Playwright...');
        html = await fetchHtmlWithPlaywright(url, {
          headless: options.headless,
          browser: options.browser,
          engine: options.browserEngine ?? process.env.PCS_BROWSER_ENGINE,
          channel: options.browserChannel ?? process.env.PCS_BROWSER_CHANNEL,
          executablePath:
            options.browserExecutablePath ?? process.env.PCS_BROWSER_EXECUTABLE_PATH,
          launchArgs: options.browserArgs ?? process.env.PCS_BROWSER_ARGS,
        });
      } else {
        throw error;
      }
    }
  }
  const $ = cheerio.load(html);

  const riderName = $('h1').first().text().trim();
  const team = normalizeTeamName(
    $('.page-title .subtitle h2').first().text().trim() ||
      $('.riderInfo a').first().text().trim()
  );
  let photoUrl = extractPhotoUrl($);

  const races = [];
  $('table tbody tr').each((index, element) => {
    const cells = $(element).find('td');
    if (!cells.length) {
      return;
    }

    const date = $(cells[0]).text().trim();
    const linkNode = $(cells[1]).find('a').first();
    const raceName = linkNode.text().trim();
    const raceLink = toAbsoluteUrl(PCS_BASE_URL, linkNode.attr('href'));
    const result = $(cells[2]).text().trim() || 'Upcoming';

    if (raceName && isIsoDate(date)) {
      races.push({
        date,
        raceName,
        raceLink,
        result,
      });
    }
  });

  if (!photoUrl) {
    const profileUrl = `${PCS_BASE_URL}/rider/${riderSlug}`;
    let profileHtml;
    if (useBrowser) {
      profileHtml = await fetchHtmlWithPlaywright(profileUrl, {
        headless: options.headless,
        browser: options.browser,
        engine: options.browserEngine ?? process.env.PCS_BROWSER_ENGINE,
        channel: options.browserChannel ?? process.env.PCS_BROWSER_CHANNEL,
        executablePath:
          options.browserExecutablePath ?? process.env.PCS_BROWSER_EXECUTABLE_PATH,
        launchArgs: options.browserArgs ?? process.env.PCS_BROWSER_ARGS,
        debugDir: options.debugDir,
      });
    } else {
      profileHtml = await fetchHtml(profileUrl, {
        rateLimiter,
        retries: {
          maxRetries,
          baseDelayMs,
        },
      });
    }
    photoUrl = extractPhotoUrl(cheerio.load(profileHtml));
  }

  return {
    rider: { name: riderName, team, photoUrl },
    calendar: races,
    scrapedAt: new Date().toISOString(),
    source: 'procyclingstats',
  };
}

async function scrapeUciRiderCalendar(riderUrl, options = {}) {
  const playwright = await loadPlaywright();

  console.log(`Scraping UCI: ${riderUrl}`);

  const engineName = (
    options.browserEngine ??
    process.env.UCI_BROWSER_ENGINE ??
    'chromium'
  ).toLowerCase();
  const engine = resolvePlaywrightEngine(playwright, engineName);

  if (!engine) {
    throw new Error(`Unsupported browser engine "${engineName}". Use chromium, firefox, or webkit.`);
  }

  const launchArgs = parseBrowserArgs(
    options.browserArgs ?? process.env.UCI_BROWSER_ARGS
  );
  const browser = await engine.launch({
    headless: options.headless !== false,
    channel: options.browserChannel ?? process.env.UCI_BROWSER_CHANNEL,
    executablePath:
      options.browserExecutablePath ?? process.env.UCI_BROWSER_EXECUTABLE_PATH,
    args: launchArgs,
  });
  const page = await browser.newPage();

  try {
    await page.goto(riderUrl, { waitUntil: 'networkidle' });

    const calendarTab = page.getByRole('tab', { name: /calendar/i });
    if (await calendarTab.count()) {
      await calendarTab.first().click();
    }

    await page.waitForSelector(
      'div[role="tabpanel"][aria-labelledby*="calendar"] table tbody tr,' +
        'section[data-component*="calendar"] table tbody tr,' +
        '[data-testid*="calendar"] table tbody tr',
      { timeout: 15000 }
    );

    const riderName = (await page.textContent('h1'))?.trim() || '';
    const team = (await page
      .textContent('a[href*="/team/"], a[href*="/team-details/"]')
      ?.trim()) || '';

    const races = await page.$$eval(
      'div[role="tabpanel"][aria-labelledby*="calendar"] table tbody tr,' +
        'section[data-component*="calendar"] table tbody tr,' +
        '[data-testid*="calendar"] table tbody tr',
      (rows) =>
        rows
          .map((row) => {
            const cells = row.querySelectorAll('td');
            const date = cells[0]?.textContent?.trim() || '';
            const linkNode = row.querySelector('a[href]');
            const raceName = linkNode?.textContent?.trim() || '';
            const raceLink = linkNode?.href || null;
            const result = cells[cells.length - 1]?.textContent?.trim() || 'Upcoming';

            if (!raceName) {
              return null;
            }

            return {
              date,
              raceName,
              raceLink,
              result,
            };
          })
          .filter(Boolean)
    );

    return {
      rider: { name: riderName, team },
      calendar: races,
      scrapedAt: new Date().toISOString(),
      source: 'uci',
    };
  } finally {
    await browser.close();
  }
}

async function runFromCli() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    const value = process.argv[i + 1];
    if (key?.startsWith('--')) {
      args.set(key.replace(/^--/, ''), value);
      i += 1;
    } else if (!args.has('source')) {
      args.set('source', key);
      i -= 1;
    }
  }

  const source = args.get('source') || 'procyclingstats';
  const outputPath = args.get('out') || 'rider-calendar.json';

  let data;
  if (source === 'procyclingstats') {
    const riderSlug = args.get('rider');
    if (!riderSlug) {
      throw new Error('Missing --rider <slug> for ProCyclingStats');
    }
    data = await scrapeProCyclingStatsRiderCalendar(riderSlug);
  } else if (source === 'uci') {
    const riderUrl = args.get('url');
    if (!riderUrl) {
      throw new Error('Missing --url <riderUrl> for UCI');
    }
    data = await scrapeUciRiderCalendar(riderUrl, {
      headless: args.get('headless') !== 'false',
    });
  } else {
    throw new Error(`Unknown source: ${source}`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Saved calendar to ${outputPath}`);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  runFromCli().catch((error) => {
    console.error('Scraping error:', error.message);
    process.exit(1);
  });
}

export { scrapeProCyclingStatsRiderCalendar, scrapeUciRiderCalendar, sleep };
