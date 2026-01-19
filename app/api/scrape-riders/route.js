import axios from 'axios';
import * as cheerio from 'cheerio';

import prisma from '../../../lib/prisma.mjs';

const TEAM_PAGES = [
  {
    teamName: 'Visma | Lease a Bike',
    url: 'https://www.procyclingstats.com/team/visma-lease-a-bike-2025',
  },
  {
    teamName: 'UAE Team Emirates',
    url: 'https://www.procyclingstats.com/team/uae-team-emirates-2025',
  },
];

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function parseDate(value) {
  if (!value) {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }

  const direct = Date.parse(cleaned);
  if (!Number.isNaN(direct)) {
    return new Date(direct);
  }

  return null;
}

function extractNationality($, cell) {
  const flag = $(cell).find('.flag').first();
  if (flag.length) {
    const className = flag.attr('class') || '';
    const match = className.match(/\bflag\s+([a-z]{2})\b/i);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  const text = $(cell).text().trim();
  return text || null;
}

function parseTeamRoster(html, teamName) {
  const $ = cheerio.load(html);
  const riders = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (!cells.length) {
      return;
    }

    const riderLink = $(row).find('a[href*="rider/"]').first();
    const name = riderLink.text().trim();
    if (!name) {
      return;
    }

    const nationality = extractNationality($, cells.eq(1));
    const birthDateRaw = cells
      .filter((_, cell) => {
        const text = $(cell).text().trim();
        return /\d{4}/.test(text) && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text);
      })
      .first()
      .text()
      .trim();

    riders.push({
      name,
      nationality,
      birthDate: parseDate(birthDateRaw),
      team: teamName,
    });
  });

  return riders;
}

async function fetchTeamHtml(url) {
  const response = await axios.get(url, { headers: DEFAULT_HEADERS });
  return response.data;
}

async function upsertRider(rider) {
  const existing = await prisma.rider.findFirst({
    where: {
      name: rider.name,
    },
  });

  if (existing) {
    return prisma.rider.update({
      where: { id: existing.id },
      data: {
        team: rider.team,
        nationality: rider.nationality,
        birthDate: rider.birthDate,
      },
    });
  }

  return prisma.rider.create({
    data: {
      slug: rider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      name: rider.name,
      team: rider.team,
      nationality: rider.nationality,
      birthDate: rider.birthDate,
    },
  });
}

export async function GET() {
  const summary = {
    scraped: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  for (const team of TEAM_PAGES) {
    try {
      const html = await fetchTeamHtml(team.url);
      const riders = parseTeamRoster(html, team.teamName);
      summary.scraped += riders.length;

      for (const rider of riders) {
        try {
          const existing = await prisma.rider.findFirst({
            where: { name: rider.name },
            select: { id: true },
          });

          await upsertRider(rider);
          if (existing) {
            summary.updated += 1;
          } else {
            summary.created += 1;
          }
        } catch (error) {
          summary.errors.push({
            rider: rider.name,
            error: error.message,
          });
        }
      }
    } catch (error) {
      summary.errors.push({
        team: team.teamName,
        error: error.message,
      });
    }
  }

  return Response.json(summary);
}
