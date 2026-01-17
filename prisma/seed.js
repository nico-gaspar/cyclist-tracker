import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RIDER_FILES = [
  'tadej.json',
  'jonas.json',
  'remco.json',
  'primoz.json',
  'mathieu.json',
  'wout.json',
  'egan.json',
  'adam.json',
  'sepp.json',
];

function toSlug(filename) {
  return filename.replace(/\.json$/, '');
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function seed() {
  for (const filename of RIDER_FILES) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing file: ${filename}`);
      continue;
    }

    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (payload?.rider?.name?.toLowerCase() === 'page not found') {
      console.warn(`Skipping 404 payload: ${filename}`);
      continue;
    }

    const slug = toSlug(filename);
    const rider = await prisma.rider.upsert({
      where: { slug },
      create: {
        slug,
        name: payload?.rider?.name || slug,
        team: payload?.rider?.team || null,
        photoUrl: payload?.rider?.photoUrl || null,
      },
      update: {
        name: payload?.rider?.name || slug,
        team: payload?.rider?.team || null,
        photoUrl: payload?.rider?.photoUrl || null,
      },
    });

    await prisma.calendarEntry.deleteMany({ where: { riderId: rider.id } });

    const entries = (payload.calendar || [])
      .filter((entry) => isIsoDate(entry?.date))
      .map((entry) => ({
        riderId: rider.id,
        date: new Date(`${entry.date}T00:00:00Z`),
        raceName: entry.raceName,
        raceLink: entry.raceLink,
        result: entry.result,
      }));

    if (entries.length) {
      await prisma.calendarEntry.createMany({ data: entries });
    }

    console.log(`Seeded ${slug} with ${entries.length} entries`);
  }
}

seed()
  .catch((error) => {
    console.error('Seed error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
