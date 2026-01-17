'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const YEAR = 2026;
const DEFAULT_VIEW = 'year';

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1;
  const key = `${YEAR}-${String(month).padStart(2, '0')}`;
  const label = new Date(Date.UTC(YEAR, index, 1)).toLocaleString('en-US', {
    month: 'short',
  });
  return { key, label };
});

const BAR_COLOR = '#f6c89a';

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function normalizeMonthParam(value) {
  if (!value) {
    return null;
  }
  if (value === 'year') {
    return 'year';
  }
  const match = String(value).match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getDurationDays(entry) {
  const name = entry.raceName?.toLowerCase() || '';
  if (name.includes('tour de france')) return 23;
  if (name.includes("giro d'italia")) return 24;
  if (name.includes('vuelta a espana')) return 24;
  if (name.includes('paris-nice')) return 8;
  if (name.includes('tirreno-adriatico')) return 7;
  if (name.includes('volta ciclista a catalunya')) return 7;
  if (name.includes('tour de romandie')) return 6;
  if (name.includes('tour de suisse')) return 8;
  if (name.includes('uae tour')) return 7;
  if (name.includes('criterium du dauphine')) return 8;
  if (entry.result?.startsWith('2.')) return 7;
  return 1;
}

function flagForRace(entry) {
  const name = entry.raceName?.toLowerCase() || '';
  if (name.includes('tour de france')) return '🇫🇷';
  if (name.includes("giro d'italia")) return '🇮🇹';
  if (name.includes('vuelta a espa')) return '🇪🇸';
  if (name.includes('tour of oman')) return '🇴🇲';
  if (name.includes('uae tour')) return '🇦🇪';
  if (name.includes('tour de suisse')) return '🇨🇭';
  if (name.includes('tour de romandie')) return '🇨🇭';
  if (name.includes('paris-nice')) return '🇫🇷';
  if (name.includes('milano-sanremo')) return '🇮🇹';
  if (name.includes('ronde van vlaanderen')) return '🇧🇪';
  if (name.includes('paris-roubaix')) return '🇫🇷';
  if (name.includes('liege-bastogne-liege')) return '🇧🇪';
  if (name.includes('strade bianche')) return '🇮🇹';
  if (name.includes('tour of slovenia')) return '🇸🇮';
  if (name.includes('crit')) return '🇫🇷';
  return '🏁';
}

function countryForRace(entry) {
  const name = entry.raceName?.toLowerCase() || '';
  if (name.includes('tour de france') || name.includes('paris-')) return 'France';
  if (name.includes("giro d'italia") || name.includes('milano')) return 'Italy';
  if (name.includes('vuelta a espa')) return 'Spain';
  if (name.includes('tour of oman')) return 'Oman';
  if (name.includes('uae tour')) return 'United Arab Emirates';
  if (name.includes('tour de suisse') || name.includes('romandie')) return 'Switzerland';
  if (name.includes('ronde van vlaanderen') || name.includes('liege')) return 'Belgium';
  if (name.includes('tour of slovenia')) return 'Slovenia';
  return 'International';
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateRange(startDate, endDate) {
  if (startDate.toDateString() === endDate.toDateString()) {
    return formatDateLong(startDate);
  }

  if (
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth()
  ) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(startDate);
    return `${month} ${startDate.getUTCDate()}–${endDate.getUTCDate()}, ${startDate.getUTCFullYear()}`;
  }

  const start = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(startDate);
  const end = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(endDate);
  return `${start} – ${end}`;
}

function categoryForRace(entry) {
  const name = entry.raceName?.toLowerCase() || '';
  if (name.includes('tour de france') || name.includes("giro d'italia") || name.includes('vuelta a espa')) {
    return 'Grand Tour';
  }
  if (entry.result?.includes('UWT')) {
    return 'WorldTour';
  }
  if (entry.result?.includes('Pro')) {
    return 'ProSeries';
  }
  if (entry.result?.startsWith('1.')) {
    return 'Class 1';
  }
  return entry.result || null;
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const [riders, setRiders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const response = await fetch('/api/calendar');
      const data = await response.json();
      if (isMounted) {
        setRiders(data.riders || []);
        setIsLoading(false);
      }
    }
    load().catch(() => {
      if (isMounted) {
        setRiders([]);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const requestedMonth = searchParams?.get('month');
  const normalizedMonth = normalizeMonthParam(requestedMonth);
  const monthKey =
    normalizedMonth === 'year'
      ? 'year'
      : MONTHS.find((month) => month.key === normalizedMonth)?.key;
  const viewKey = monthKey || DEFAULT_VIEW;

  const isYearView = viewKey === 'year';
  const dayCount = isYearView ? 12 : daysInMonth(viewKey);
  const colWidth = isYearView ? 120 : 34;
  const daysOrMonths = isYearView
    ? MONTHS.map((month) => month.label)
    : Array.from({ length: dayCount }, (_, index) => index + 1);
  const [filterYear, filterMonth] = isYearView
    ? [YEAR, 1]
    : viewKey.split('-').map(Number);
  const monthStart = new Date(Date.UTC(filterYear, filterMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(filterYear, filterMonth, 0, 23, 59, 59, 999));
  const yearStart = new Date(Date.UTC(YEAR, 0, 1));
  const yearEnd = new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59, 999));

  const filteredRiders = useMemo(() => {
    const rangeStart = isYearView ? yearStart : monthStart;
    const rangeEnd = isYearView ? yearEnd : monthEnd;
    return riders.map((rider) => ({
      ...rider,
      calendarEntries: (rider.calendarEntries || []).filter((entry) => {
        const date = new Date(entry.date);
        return date >= rangeStart && date <= rangeEnd;
      }),
    }));
  }, [riders, isYearView, monthStart, monthEnd, yearStart, yearEnd]);

  useEffect(() => {
    if (!isYearView) {
      return;
    }
    const debugRaces = [];
    for (const rider of filteredRiders) {
      for (const entry of rider.calendarEntries || []) {
        const isoDate = toDateKey(entry.date);
        if (
          entry.raceName?.includes('Tour de France') ||
          entry.raceName?.includes("Giro d'Italia") ||
          entry.raceName?.includes('Milano-Sanremo')
        ) {
          const monthIndex = Number(isoDate.slice(5, 7));
          debugRaces.push({
            race: entry.raceName,
            date: isoDate,
            monthIndex,
            column: monthIndex + 1,
          });
        }
      }
    }
    if (debugRaces.length) {
      // eslint-disable-next-line no-console
      console.log('Year view race month placement', debugRaces);
    }
  }, [filteredRiders, isYearView]);


  return (
    <main className="container timeline-page">
      <header className="calendar-header">
        <h2>{isYearView ? `${YEAR} Overview` : formatMonthLabel(viewKey)}</h2>
        <div className="month-tabs">
          <Link
            href="/calendar?month=year"
            className={isYearView ? 'active year-tab' : 'year-tab'}
          >
            {YEAR}
          </Link>
          {MONTHS.map((month) => (
            <Link
              key={month.key}
              href={`/calendar?month=${month.key}`}
              className={month.key === viewKey ? 'active' : undefined}
            >
              {month.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="timeline-section">
        {isLoading ? <p className="muted">Loading calendar...</p> : null}
        <div className="timeline-wrapper">
          <div
            className="timeline-grid"
            style={{
              '--col-count': dayCount,
              '--col-width': `${colWidth}px`,
            }}
          >
            <div className="timeline-row timeline-head">
              <div className="timeline-label">Rider</div>
              {daysOrMonths.map((label, index) => (
                <div
                  key={`col-${label}-${index}`}
                  className="timeline-day timeline-cell"
                >
                  {label}
                </div>
              ))}
            </div>

            {filteredRiders.map((rider) => {
              const entries = rider.calendarEntries || [];
              const barColor = BAR_COLOR;

              return (
                <div
                  key={rider.id}
                  className="timeline-row timeline-rider timeline-row-bordered"
                  style={{
                    gridTemplateRows: '1fr',
                  }}
                >
                  <div className="timeline-label timeline-label-sticky">
                    <div className="rider-label">
                      <div className="avatar small">
                        {rider.photoUrl ? (
                          <img src={rider.photoUrl} alt={rider.name} />
                        ) : (
                          <div className="avatar-fallback">{rider.name?.[0] || '?'}</div>
                        )}
                      </div>
                      <div>
                        <strong>{rider.name}</strong>
                        {rider.team ? <div className="muted">{rider.team}</div> : null}
                      </div>
                    </div>
                  </div>

                  {entries.map((entry) => {
                    const isoDate = toDateKey(entry.date);
                    const entryDate = new Date(entry.date);
                    const day = Number(isoDate.slice(8, 10));
                    const durationDays = getDurationDays(entry);
                    const duration = Math.min(durationDays, dayCount - day + 1);
                    const monthIndex = Number(isoDate.slice(5, 7));
                    const daysInRaceMonth = new Date(
                      Date.UTC(YEAR, monthIndex, 0)
                    ).getUTCDate();
                    const yearWidthPercent = Math.min(
                      100,
                      Math.max(10, Math.round((durationDays / daysInRaceMonth) * 100))
                    );
                    const gridColumnStart = isYearView ? monthIndex + 1 : day + 1;
                    const endDate = new Date(entryDate);
                    endDate.setUTCDate(endDate.getUTCDate() + Math.max(0, durationDays - 1));
                    const category = categoryForRace(entry);
                    return (
                      <TooltipProvider key={entry.id} delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="race-bar"
                              style={{
                                gridColumn: `${gridColumnStart} / span ${isYearView ? 1 : duration}`,
                                gridRow: '1',
                                backgroundColor: barColor,
                                width: isYearView
                                  ? `calc(var(--col-width) * ${yearWidthPercent / 100})`
                                  : 'auto',
                              }}
                            >
                              <span className="race-flag">{flagForRace(entry)}</span>
                              <span className="race-name">{entry.raceName}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="center" className="race-tooltip">
                            <div className="race-title">{entry.raceName}</div>
                            <div className="race-subtitle">{countryForRace(entry)}</div>
                            <div className="race-detail">
                              {formatDateRange(entryDate, endDate)}
                            </div>
                            <div className="race-detail">
                              {durationDays} {durationDays === 1 ? 'day' : 'days'}
                            </div>
                            {category ? (
                              <div className="race-detail">Type: {category}</div>
                            ) : null}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
