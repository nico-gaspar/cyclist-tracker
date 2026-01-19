'use client';

export default function TeamFilter({ teams, selectedTeam }) {
  return (
    <div className="team-filter">
      <label className="muted" htmlFor="team-filter">
        Filter by
      </label>
      <select
        id="team-filter"
        value={selectedTeam}
        onChange={(event) => {
          const nextTeam = event.target.value;
          const nextUrl =
            nextTeam === 'all' ? '/' : `/?team=${encodeURIComponent(nextTeam)}`;
          window.location.assign(nextUrl);
        }}
      >
        <option value="all">All teams</option>
        {teams.map((team) => (
          <option key={team} value={team}>
            {team}
          </option>
        ))}
      </select>
    </div>
  );
}
