# Fang League: Club Manager development edition

Built by Grok Bot.

A small fantasy football club manager inspired by the growing-club loop of Pocket League Story, with original brutal fantasy teams. Independent working copy of [malachiian/fang-league](https://github.com/malachiian/fang-league), preserving its Git history. GitHub does not allow a same-account parent and fork.

## Run

No build step or runtime dependencies. Serve this directory:

```sh
python -m http.server 8743
```

Open http://127.0.0.1:8743. GitHub Pages serves `main` from `/`.

```sh
npm test
node sim.js 20
```

Tests use Node's built-in test runner. The balance report runs 20 free-practice seasons per team with the existing opponent AI management; it is not a coached-play balance verdict.

## Play

Choose one of 12 teams, build your club, recruit and train players, then watch five-a-side matches. Ten matches decide each six-team division. Division champions meet in a cup final. Squads, gold, fans and facilities carry into future seasons, with tougher rivals.

- **Clubhouse:** interactive grounds, next fixture, recent results and six one-time rewarded ambitions.
- **This week:** assign one activity per player, review the total cost, run the preparation week and see a player-by-player progress report.
- **Squad:** seven starting players, up to ten on the roster; stats, XP, levels, injuries, instant healing and shortcuts to weekly planning.
- **Recruit:** a three-player scouting pool and paid rerolls.
- **Upgrades:** three levels each of training ground, club clinic and stadium. These increase weekly capacity, improve treatment, reduce costs and increase match income.
- **League:** two divisions, standings and cup qualification.
- **Match:** choose your starting five and power, passing or pressure tactics. Watch spatial five-a-side play with pause, 1x/2x/4x, fullscreen, slow-motion replays and detailed match reports.
- **Exhibition:** immediately watch any two clubs without changing a career. The opening Orcs vs Elves matchup uses roster seed 42 and match seed 3; its result emerges from the same engine as career matches. Watch again repeats it; rematch chooses a fresh seed.

## Match engine and broadcast

Players move on a 100 by 60 field in 0.1-second steps. Strength changes blocking/tackle contests; speed changes movement; agility changes dodges, catches, pickups and interceptions; passing changes throw accuracy. Power running uses two lead blockers and early handoffs. Wide passing spreads receivers and throws earlier. Pressure defense sends extra defenders after the carrier and leaves more space behind them.

Six alternating possessions have a 24-second play clock. Reaching the opposing end zone scores a touchdown. Tackles spill a live ball; either team can recover it or intercept a pass and counterattack in the same possession. Knocked-down players get back up; injured players leave and fit reserves enter at the next possession. Ties get one extra possession per side and can still end level. The cup retains the league-record tiebreaker after overtime. This is an original continuous simulation, not official Blood Bowl rules.

Playback interpolates recorded positions rather than inventing plays after a score roll. The scoreboard follows the displayed frame, including during replays. Scores, interceptions, contacts and injuries drive the broadcast overlays; post-match statistics come from those same events. Auto replays show the last five seconds before a touchdown at slow speed. Reduced-motion preference suppresses auto replays and camera shake. Exhibitions never award career money, injuries or XP.

For promo capture: **Watch an exhibition → Watch the match → Full screen**. Keep the opening Orcs/Elves plans for a repeatable showcase with handoffs, passing, turnovers, an injury substitution and overtime. A rematch uses a new match seed. Browser fullscreen and capture resolution depend on your display.

## Weekly management loop

Each league fixture has one preparation week:

1. Open **This week** and choose one activity per player. Fit players default to free team practice; injured players default to rest.
2. Review the cost and facility capacity. Adjust an over-budget or overbooked plan. Assignments save immediately, but nothing is charged yet.
3. Select **Run this week**. The entire valid plan is applied once, then a report shows actual growth and costs.
4. Play the match. The next week opens with a fresh plan. The cup final follows the final league round without an additional preparation week.

| Activity | Effect | Capacity / cost |
| --- | --- | --- |
| Team practice | +2 XP | Free for every fit player |
| Coached strength, speed, agility or passing | +1 chosen stat and +4 XP; level-2+ grounds have a 25% chance of +2 instead, capped at 20 | 3 places plus one per training-ground level; existing stat-based coaching price |
| Treatment | Removes 1 match of injury before kickoff, or 2 at clinic level 2+ | 1 place plus one per clinic level; 8/6/4/2g per treatment, with the Undead discount |
| Meet the fans | +1 club fan | Free; 1 place plus one per stadium level |
| Rest | No pre-match gains; ordinary injury countdown still occurs after a match | Free |

The training ground costs 150/280/420g, stadium 170/320/480g, clinic 120/220/340g. Existing instant healing remains available as a more expensive alternative. Upgrading a facility after the week has finished does not reopen the week. The latest 12 weekly reports persist; the clubhouse shows the most recent report.

The clubhouse figures remain ambient animation; there is no passive real-time training or free building placement. Activities are resolved when you advance the week, with real stat, XP, injury and fan changes.

## Saving

Career state saves to this browser's localStorage after management actions and results. Refresh during playback returns to the saved pre-match state: replay uses the same seed, and rewards are not applied twice. Refresh after a result retains the result and opens the clubhouse (or season review). Restart requires confirmation and clears this edition's save.

Saves are local to the browser and site origin, not synced across devices. Clearing browser storage deletes the save. Version-one careers migrate to the new weekly system while retaining their money, roster, facilities, results and already-used training slots. An untouched version-one backup is kept in localStorage when space permits. Invalid saves are left intact until a new club is started. When storage fails, the footer reports the failure. There is no import/export or cloud account yet.

## Code

- `src/data.js`: teams, economy, player generation and progression.
- `src/match.js`: public match API, independent of DOM.
- `src/match-core.js`: seeded RNG, lineup selection and shared ratings helpers.
- `src/spatial-match.js`: movement, contact, ball physics, tactical decisions and recorded match state.
- `src/match-view.js`: interpolated canvas broadcast, scoreboard, effects and replay presentation.
- `src/season.js`: schedule, league results, roster transactions, history and season advancement.
- `src/club.js`: one-time club goals and rewards.
- `src/save.js`: versioned persistence, legacy migration and validation.
- `src/weekly.js`: planning, capacity/cost validation, weekly effects and reports.
- `src/weekly-view.js`: weekly planning and growth-report screens.
- `src/game.js`: screens, interaction and canvas playback.
- `src/assets.js`: manifest of supplied PNGs. The loader skips unavailable optional expressions/poses and uses existing fallback art. Update this manifest when adding images.
- `src/club.css`: clubhouse presentation and responsive layouts.

## Art

The repository includes 419 PNGs: team crests, pitch, painted player bodies/poses, all four portrait expressions for all 48 positions, clubhouse grounds, and training/stadium levels 0 through 3. The delivered 129-image artwork batch was checked for filenames, dimensions, alpha and accidental duplicates. Club/opponent sprite sets load on demand; the match waits for their decode before playback. Press M to inspect failed requests for supplied art.

See [ROADMAP.md](ROADMAP.md) for the design assessment and next steps.

Human and Orc players have two running images per position. The match renderer alternates them at seven frame changes per second with individual timing offsets. Draw-time crop rectangles align the transparent padding; reduced-motion mode uses a fixed frame. Original run art remains intact beside the new *-run-alt.png assets.
