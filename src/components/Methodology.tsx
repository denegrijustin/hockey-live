export function Methodology() {
  return (
    <details className="methodology">
      <summary>
        How ratings & data work <span>↗</span>
      </summary>
      <div className="method-grid">
        <section>
          <h3>Importance / 100</h3>
          <p>
            An editorial stakes index, not a win probability. Regular season: 22
            base + 12 same conference + 12 same division + up to 26 for calendar
            progress + up to 28 for closeness to a playoff entry line. The
            closeness term starts after 10 games and fades to zero at a 14-point
            gap.
          </p>
          <p>
            Past games use prior-day standings, never the final standings.
            Future games use today’s standings with the target date’s calendar
            weight. Distant games can rank higher; their actual stakes will
            change. Equal scores share a rank. Past and upcoming ranks are
            separate, league-wide cohorts within the selected season and game
            type.
          </p>
        </section>
        <section>
          <h3>Graphs & NHL EDGE</h3>
          <p>
            Upcoming games show the last five regular-season results.
            Previous-season form is labeled when current results are not
            available. Completed and live games show cumulative shots on goal,
            hits, blocks, scoring and recorded shot locations. Shootouts are
            excluded from shot graphs.
          </p>
          <p>
            NHL EDGE charts use published team tracking statistics: skating
            speed, speed bursts, shot speed, distance, shot locations and puck
            zone time. White bar markers show league averages. EDGE is season
            context, not real-time player tracking; previous-season fallback is
            explicitly labeled. Totals depend on games played.
          </p>
        </section>
        <section>
          <h3>Player contribution</h3>
          <p>
            Skater index = goals + 0.7 × assists + 0.1 × shots + 0.25 ×
            plus/minus − 0.1 × penalty minutes. Positive and negative values
            describe the recorded box score. Plus/minus is affected by
            teammates, opponents and usage. This is not WAR, causal impact,
            expected goals, or a player’s effect on win probability.
          </p>
          <p>
            Goalies are shown separately: saves − 0.900 × shots faced, a fixed
            save-rate benchmark, not shot-quality-adjusted goals saved. Future
            cards show season contributors as context, never a confirmed lineup
            or injury adjustment.
          </p>
        </section>
        <section>
          <h3>Source & freshness</h3>
          <p>
            Schedules, results and box scores come from the NHL public data
            feed. Live scoreboard and visible live game details check every 30
            seconds while the tab is visible. Times shown are received feed
            times, not a locally simulated clock. Feed or network delays are
            possible; failed updates retain the last response and display an
            error. The Worker refreshes the current schedule nightly and
            revalidates snapshots older than 15 minutes on visits. Player
            summaries cache for six hours. A dated build snapshot remains
            available if the feed fails.
          </p>
          <p>
            All times use your device’s timezone. This dashboard is independent
            of the NHL and HockeyStats.com. HockeyStats inspired the comparison
            views; no proprietary WAR, paid data or forecasts are copied.
          </p>
          <a
            href="https://www.nhl.com/info/standings-info/playoff-format"
            target="_blank"
            rel="noreferrer"
          >
            NHL playoff format ↗
          </a>
        </section>
      </div>
    </details>
  );
}
