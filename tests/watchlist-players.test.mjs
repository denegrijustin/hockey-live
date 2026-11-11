import test from "node:test";
import assert from "node:assert/strict";
import { followedSummaries, splitSummaries, playsTonight, tonightLabel, toiText, svText, applySnapshots, injuryFor } from "../src/lib/watchlist-players.mjs";

const sk = (id, name, team, o = {}) => ({ id, name, team, position: "C", gp: 10, goals: 4, assists: 6, shots: 30, plusMinus: -2, pim: 0, toi: 20.5, headshot: "", number: 97, ...o });
const gl = (id, name, team, o = {}) => ({ id, name, team, position: "G", gp: 8, saves: 200, shotsAgainst: 220, savePct: 0.909, headshot: "", number: 74, ...o });
const roster = (skaters, goalies = []) => ({ skaters, goalies });
const f = (id, name, team, pos = "C") => ({ id, name, team, pos, number: 97, headshot: "", at: 1 });

test("skater and goalie lines", () => {
  const [a, b] = followedSummaries([f(1, "A Skater", "EDM"), f(2, "A Goalie", "NSH", "G")], [roster([sk(1, "A Skater", "EDM")]), roster([], [gl(2, "A Goalie", "NSH")])]);
  assert.deepEqual(a.lines.map((l) => l.k), ["GP", "G", "A", "PTS", "+/−", "Shots", "TOI"]);
  assert.deepEqual(a.lines.map((l) => l.text), ["10", "4", "6", "10", "−2", "30", "20:30"]);
  assert.equal(a.goalie, false);
  assert.deepEqual(b.lines.map((l) => l.k), ["GP", "SV%", "Saves", "GA"]);
  assert.deepEqual(b.lines.map((l) => l.text), ["8", ".909", "200", "20"]);
  assert.equal(b.goalie, true);
});
test("missing stats are a dash, never zero", () => {
  const [a] = followedSummaries([f(1, "A", "EDM")], [roster([sk(1, "A", "EDM", { goals: null, shots: undefined, toi: 0, plusMinus: null })])]);
  const t = Object.fromEntries(a.lines.map((l) => [l.k, l.text]));
  assert.equal(t.G, "—"); assert.equal(t.PTS, "—"); assert.equal(t.Shots, "—"); assert.equal(t.TOI, "—"); assert.equal(t["+/−"], "—");
  assert.equal(a.lines.find((l) => l.k === "G").missing, true);
  const [g] = followedSummaries([f(2, "G", "NSH", "G")], [roster([], [gl(2, "G", "NSH", { saves: null, savePct: null })])]);
  assert.equal(g.lines.find((l) => l.k === "GA").text, "—");
});
test("trade: current roster team differs from the stored one", () => {
  const [a] = followedSummaries([f(1, "A", "EDM")], [roster([sk(1, "A", "CGY")])]);
  assert.deepEqual(a.changed, { from: "EDM", to: "CGY" });
  assert.equal(a.team, "CGY");
  assert.equal(a.update.team, "CGY");
  const players = [f(1, "A", "EDM"), f(9, "B", "TOR")];
  const next = applySnapshots(players, [a.update]);
  assert.equal(next[0].team, "CGY"); assert.equal(next[1], players[1]);
  assert.equal(applySnapshots(next, [a.update]), next, "same array when nothing changes");
});
test("player in two team files: profile team wins; otherwise the stored team, no trade claimed", () => {
  const rs = [roster([sk(1, "A", "EDM", { gp: 5 })]), roster([sk(1, "A", "CGY", { gp: 3 })])];
  const [x] = followedSummaries([f(1, "A", "EDM")], rs);
  assert.equal(x.team, "EDM"); assert.equal(x.changed, null);
  const [y] = followedSummaries([f(1, "A", "EDM")], rs, null, { currentTeams: { 1: "CGY" } });
  assert.equal(y.team, "CGY"); assert.equal(y.changed.to, "CGY"); assert.equal(y.lines[0].text, "3");
  const [z] = followedSummaries([f(1, "A", "TOR")], rs);
  assert.equal(z.onRoster, false, "stored team not among the files and no profile team: no guess");
});
test("not on any roster", () => {
  const [a] = followedSummaries([f(5, "Gone", "EDM")], [roster([sk(1, "A", "EDM")])]);
  assert.equal(a.onRoster, false); assert.equal(a.rostersLoaded, true); assert.equal(a.team, "EDM"); assert.equal(a.update, null);
  assert.ok(a.lines.every((l) => l.text === "—"));
  const [b] = followedSummaries([f(5, "Gone", "EDM")], []);
  assert.equal(b.rostersLoaded, false);
});
test("injury: exactly one name+team match, else none", () => {
  const rs = [roster([sk(1, "Léon Draisaitl", "EDM"), sk(2, "Twin Name", "EDM"), sk(3, "Twin Name", "EDM")])];
  const inj = [{ name: "Leon Draisaitl", team: "EDM", status: "Day-To-Day", kind: "Lower body" }, { name: "Twin Name", team: "EDM", status: "Out" }, { name: "Leon Draisaitl", team: "TOR", status: "Out" }];
  const s = followedSummaries([f(1, "Léon Draisaitl", "EDM"), f(2, "Twin Name", "EDM")], rs, inj);
  assert.equal(s[0].injury.status, "Day-To-Day");
  assert.equal(s[1].injury, null, "two roster players share a name: never guess");
  assert.equal(followedSummaries([f(1, "Léon Draisaitl", "EDM")], rs, null)[0].injuryKnown, false);
  assert.equal(injuryFor("X", "EDM", [{ name: "X", team: "EDM" }, { name: "x", team: "EDM" }], []), null, "duplicate report entries are ambiguous");
});
test("split and sort", () => {
  const list = followedSummaries([f(2, "Zed", "EDM"), f(1, "Abe", "EDM"), f(3, "Gus", "NSH", "G")], [roster([sk(1, "Abe", "EDM"), sk(2, "Zed", "EDM")], [gl(3, "Gus", "NSH")])]);
  const { skaters, goalies } = splitSummaries(list);
  assert.deepEqual(skaters.map((s) => s.name), ["Abe", "Zed"]); assert.deepEqual(goalies.map((s) => s.name), ["Gus"]);
});
test("plays tonight comes only from the loaded schedule", () => {
  const games = [{ id: 1, date: "2026-11-10", home: "EDM", away: "VAN", state: "FUT" }, { id: 2, date: "2026-11-10", home: "TOR", away: "BOS", state: "OFF" }, { id: 3, date: "2026-11-10", home: "MIN", away: "CHI", state: "FUT", scheduleState: "PPD" }, { id: 4, date: "2026-11-11", home: "NSH", away: "STL", state: "FUT" }];
  assert.equal(playsTonight("EDM", games, "2026-11-10").id, 1);
  assert.equal(playsTonight("VAN", games, "2026-11-10").id, 1);
  assert.equal(playsTonight("TOR", games, "2026-11-10"), null, "already final");
  assert.equal(playsTonight("MIN", games, "2026-11-10"), null, "postponed");
  assert.equal(playsTonight("NSH", games, "2026-11-10"), null, "another day");
  assert.equal(playsTonight("EDM", [], "2026-11-10"), null);
  assert.equal(tonightLabel("EDM", games[0]), "Plays tonight vs VAN");
  assert.equal(tonightLabel("VAN", games[0]), "Plays tonight at EDM");
});
test("formatters", () => {
  assert.equal(toiText(19.9999), "20:00"); assert.equal(toiText(null), null); assert.equal(svText(91.1), ".911"); assert.equal(svText(undefined), null);
});
