import fs from 'fs';
import { fileURLToPath } from 'url';
import { scrapeProCyclingStatsRiderCalendar, sleep } from './scrape-rider.js';

const RIDERS = [
  { slug: 'jonas-vingegaard', file: 'jonas.json' },
  { slug: 'remco-evenepoel', file: 'remco.json' },
  { slug: 'primoz-roglic', file: 'primoz.json' },
  { slug: 'mathieu-van-der-poel', file: 'mathieu.json' },
  { slug: 'wout-van-aert', file: 'wout.json' },
  { slug: 'egan-bernal', file: 'egan.json' },
  { slug: 'adam-yates', file: 'adam.json' },
  { slug: 'juan-ayuso', file: 'juan.json' },
  { slug: 'sepp-kuss', file: 'sepp.json' },
];

const DELAY_MS = 2000;

async function runBatch() {
  for (const [index, rider] of RIDERS.entries()) {
    const data = await scrapeProCyclingStatsRiderCalendar(rider.slug, {
      useBrowser: true,
    });

    fs.writeFileSync(rider.file, JSON.stringify(data, null, 2));
    console.log(`Saved ${rider.slug} to ${rider.file}`);

    if (index < RIDERS.length - 1) {
      await sleep(DELAY_MS);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  runBatch().catch((error) => {
    console.error('Batch scrape error:', error.message);
    process.exit(1);
  });
}
