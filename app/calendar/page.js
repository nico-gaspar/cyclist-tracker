'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const YEAR = 2026;
const DEFAULT_VIEW = 'year';
const ORDER_STORAGE_KEY = 'calendar-order';

const MONTHS = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1;
  const key = `${YEAR}-${String(month).padStart(2, '0')}`;
  const label = new Date(Date.UTC(YEAR, index, 1)).toLocaleString('en-US', {
    month: 'short',
  });
  return { key, label };
});

const BAR_COLOR = '#f6c89a';
const POPULARITY_ORDER = {
  'tadej': 1,
  'tadej-pogacar': 1,
  'tadej-poga-ar': 1,
  'jonas-vingegaard': 2,
  'jonas': 2,
  'remco-evenepoel': 3,
  'remco': 3,
  'primoz-roglic': 4,
  'primoz': 4,
  'mathieu-van-der-poel': 5,
  'mathieu': 5,
  'wout-van-aert': 6,
  'wout': 6,
  'juan-ayuso': 7,
  'jasper-philipsen': 8,
  'matteo-jorgenson': 9,
  'isaac-del-toro': 10,
  'florian-lipowitz': 11,
  'giulio-pellizzari': 12,
  'oscar-onley': 13,
  'sepp-kuss': 14,
  'sepp': 14,
};

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
  if (name.includes('volta ciclista a catalunya') || name.includes('volta cataluna')) return '🏴';
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

function normalizeRaceName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

function CalendarContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [riders, setRiders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [riderOrder, setRiderOrder] = useState([]);
  const [selectedRaceName, setSelectedRaceName] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const response = await fetch('/api/calendar');
      if (!response.ok) {
        throw new Error(`Calendar API failed (${response.status})`);
      }
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
  const teamParam = searchParams?.get('team');
  const normalizedMonth = normalizeMonthParam(requestedMonth);
  const monthKey =
    normalizedMonth === 'year'
      ? 'year'
      : MONTHS.find((month) => month.key === normalizedMonth)?.key;
  const viewKey = monthKey || DEFAULT_VIEW;
  const selectedTeam = teamParam ? decodeURIComponent(teamParam) : 'all';

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

  const filteredRidersBase = useMemo(() => {
    const rangeStart = isYearView ? yearStart : monthStart;
    const rangeEnd = isYearView ? yearEnd : monthEnd;
    return riders
      .filter((rider) => selectedTeam === 'all' || rider.team === selectedTeam)
      .map((rider) => ({
        ...rider,
        calendarEntries: (rider.calendarEntries || []).filter((entry) => {
          const date = new Date(entry.date);
          const entryYear = date.getUTCFullYear();
          if (entryYear !== YEAR) {
            return false;
          }
          return date >= rangeStart && date <= rangeEnd;
        }),
      }));
  }, [riders, isYearView, monthStart, monthEnd, yearStart, yearEnd, selectedTeam]);

  const defaultOrder = useMemo(() => {
    const sorted = [...riders].sort((a, b) => {
      const scoreA = POPULARITY_ORDER[a.slug] ?? Number.POSITIVE_INFINITY;
      const scoreB = POPULARITY_ORDER[b.slug] ?? Number.POSITIVE_INFINITY;
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return a.name.localeCompare(b.name);
    });
    return sorted.map((rider) => rider.id);
  }, [riders]);

  useEffect(() => {
    if (!riders.length) {
      setRiderOrder([]);
      return;
    }

    let nextOrder = defaultOrder;

    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const validIds = new Set(defaultOrder);
            nextOrder = parsed.filter((id) => validIds.has(id));
            for (const id of defaultOrder) {
              if (!nextOrder.includes(id)) {
                nextOrder.push(id);
              }
            }
          }
        } catch {
          nextOrder = defaultOrder;
        }
      }
    }

    setRiderOrder(nextOrder);
  }, [riders, defaultOrder]);

  const orderedRiders = useMemo(() => {
    if (!riderOrder.length) {
      return filteredRidersBase;
    }
    const riderMap = new Map(filteredRidersBase.map((rider) => [rider.id, rider]));
    return riderOrder.map((id) => riderMap.get(id)).filter(Boolean);
  }, [filteredRidersBase, riderOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const teamOptions = useMemo(() => {
    const uniqueTeams = Array.from(
      new Set(riders.map((rider) => rider.team).filter(Boolean))
    );
    uniqueTeams.sort((a, b) => a.localeCompare(b));
    return uniqueTeams;
  }, [riders]);

  const monthParam = viewKey === 'year' ? 'year' : viewKey;
  const teamQuery = selectedTeam !== 'all' ? `&team=${encodeURIComponent(selectedTeam)}` : '';
  const withTeamParam = (monthValue) =>
    `/calendar?month=${monthValue}${teamQuery}`;

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = riderOrder.indexOf(active.id);
    const newIndex = riderOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const nextOrder = arrayMove(riderOrder, oldIndex, newIndex);
    setRiderOrder(nextOrder);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    }
  }

  function handleResetOrder() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
    }
    setRiderOrder(defaultOrder);
  }

  function SortableRiderRow({ rider }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: rider.id,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const entries = rider.calendarEntries || [];
    const barColor = BAR_COLOR;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`timeline-row timeline-rider timeline-row-bordered ${
          isDragging ? 'is-dragging' : ''
        }`}
      >
        <div className="timeline-label timeline-label-sticky">
          <div className="rider-label">
            <button
              type="button"
              className="drag-handle"
              aria-label="Reorder rider"
              {...attributes}
              {...listeners}
            >
              ⋮⋮
            </button>
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
          const monthIndex = entryDate.getUTCMonth() + 1;
          const daysInRaceMonth = new Date(Date.UTC(YEAR, monthIndex, 0)).getUTCDate();
          const yearWidthPercent = Math.min(
            100,
            Math.max(10, Math.round((durationDays / daysInRaceMonth) * 100))
          );
          const gridColumnStart = isYearView ? monthIndex + 1 : day + 1;
          const endDate = new Date(entryDate);
          endDate.setUTCDate(endDate.getUTCDate() + Math.max(0, durationDays - 1));
          const category = categoryForRace(entry);

          const normalizedRaceName = normalizeRaceName(entry.raceName);
          const isHighlighted = selectedRaceName === normalizedRaceName;
          return (
            <TooltipProvider key={entry.id} delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`race-bar ${isHighlighted ? 'race-bar-highlight' : ''}`}
                    style={{
                      gridColumn: `${gridColumnStart} / span ${isYearView ? 1 : duration}`,
                      gridRow: '1',
                      width: isYearView
                        ? `calc(var(--col-width) * ${yearWidthPercent / 100})`
                        : 'auto',
                    }}
                    onClick={() => {
                      setSelectedRaceName((prev) =>
                        prev === normalizedRaceName ? null : normalizedRaceName
                      );
                    }}
                    onDoubleClick={(event) => {
                      if (!isYearView) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      const monthValue = isoDate.slice(0, 7);
                      const nextTeamParam =
                        selectedTeam === 'all'
                          ? ''
                          : `&team=${encodeURIComponent(selectedTeam)}`;
                      router.push(`/calendar?month=${monthValue}${nextTeamParam}`);
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
  }

  return (
    <main className="container timeline-page calendar-shell">
      <div className="calendar-top">
        <div className="month-tabs">
        <Link
          href={withTeamParam('year')}
          className={`year-tab ${isYearView ? 'active' : ''}`}
        >
          Year
        </Link>
        {MONTHS.map((month) => (
          <Link
            key={month.key}
            href={withTeamParam(month.key)}
            className={viewKey === month.key ? 'active' : ''}
          >
            {month.label}
          </Link>
        ))}
        </div>
      </div>

      <header className="calendar-header">
        <div>
          <h2>{isYearView ? `${YEAR} Overview` : formatMonthLabel(viewKey)}</h2>
        </div>
        <div className="calendar-filter">
          <label className="muted" htmlFor="team-filter">
            Team
          </label>
          <select
            id="team-filter"
            value={selectedTeam}
            onChange={(event) => {
              const nextTeam = event.target.value;
              const nextTeamParam =
                nextTeam === 'all' ? '' : `&team=${encodeURIComponent(nextTeam)}`;
              router.push(`/calendar?month=${monthParam}${nextTeamParam}`);
            }}
          >
            <option value="all">All teams</option>
            {teamOptions.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
          <button type="button" className="reset-order" onClick={handleResetOrder}>
            Reset order
          </button>
        </div>
      </header>

      <section className="timeline-section">
        {isLoading ? <p className="muted">Loading calendar...</p> : null}
        {!isLoading && orderedRiders.length === 0 ? (
          <p className="muted">
            No riders found. Check your database connection and seed data.
          </p>
        ) : null}
        <div className="timeline-wrapper">
          <div
            className={`timeline-grid ${isYearView ? 'year-view' : ''}`}
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={orderedRiders.map((rider) => rider.id)}
                strategy={verticalListSortingStrategy}
              >
                {orderedRiders.map((rider) => (
                  <SortableRiderRow key={rider.id} rider={rider} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CalendarContent />
    </Suspense>
  );
}
