export function Methodology() {
  return (
    <details className="methodology">
      <summary>
        How ratings & scenarios work <span>↗</span>
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
          <h3>Win / loss consequences</h3>
          <p>
            Scenarios show an isolated regulation win (+2, opponent +0),
            regulation loss (+0, opponent +2), or overtime/shootout loss (+1,
            opponent +2). Other games are held constant. Future games use
            current points, not a forecast of intervening results; past games
            use prior-day points.
          </p>
          <p>
            Conference ranks are points-only, with ties shown explicitly. The
            entry-line reference is the lower of the division’s third-place
            points and the conference’s second-wild-card points. It is a
            reference, not a clinching calculation; official head-to-head
            tiebreaks and games in hand are not modeled. Preseason has no
            standings consequences; playoffs use series wins.
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
            feed. The Worker refreshes the current schedule nightly and
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
