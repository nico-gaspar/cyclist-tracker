export const dynamic = 'force-dynamic';

import prisma from '../lib/prisma.mjs';

function formatDate(date) {
  if (!date) {
    return '';
  }
  return new Date(date).toISOString().slice(0, 10);
}

export default async function Home() {
  const riders = await prisma.rider.findMany({
    orderBy: { name: 'asc' },
    include: {
      calendarEntries: {
        orderBy: { date: 'asc' },
      },
    },
  });

  return (
    <main className="container">
      <section className="grid">
        {riders.map((rider) => (
          <article key={rider.id} className="card">
            <header className="card-header">
              <div className="card-title">
                <div className="avatar">
                  {rider.photoUrl ? (
                    <img src={rider.photoUrl} alt={rider.name} />
                  ) : (
                    <div className="avatar-fallback">
                      {rider.name?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div>
                  <h2>{rider.name}</h2>
                  {rider.team ? <p className="muted">{rider.team}</p> : null}
                </div>
              </div>
            </header>
            <div className="table">
              <div className="table-row table-head">
                <span>Date</span>
                <span>Race</span>
                <span className="result">Result</span>
              </div>
              {rider.calendarEntries.map((entry) => (
                <div key={entry.id} className="table-row">
                  <span>{formatDate(entry.date)}</span>
                  {entry.raceLink ? (
                    <a href={entry.raceLink} target="_blank" rel="noreferrer">
                      {entry.raceName}
                    </a>
                  ) : (
                    <span>{entry.raceName}</span>
                  )}
                  <span className="result">{entry.result || 'Upcoming'}</span>
                </div>
              ))}
              {!rider.calendarEntries.length ? (
                <div className="table-row">
                  <span className="muted">No upcoming races yet.</span>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
