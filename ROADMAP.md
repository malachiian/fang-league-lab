# Direction: a club you want to come back to

The target is a charming club-building management game with brutal fantasy football characters. The repeated loop should be: plan the week, develop players, watch recognizable choices play out, collect rewards, unlock a new possibility, and want one more match.

## What the inherited game actually has

Twelve original teams with race stats/traits and four position types each; two six-team divisions; ten fixtures per season; a cup final; gold and fans; recruitment and rerolls; individual stat training; player XP and levels; healing; stadium and training-ground upgrades; automatic five-player lineup selection; seeded match outcomes; event-driven side-view match playback; multiple seasons. 282 PNGs provide art for all twelve teams. It is a playable prototype, with a clean separation between simulation and presentation.

Matches are automatic rating checks followed by generated events and animation. This is not a spatial Blood Bowl rules simulation, and the player does not currently choose a formation, lineup or tactical plan. The next season repeats the same competition with rival stats increased. There is no promotion ladder, sponsor negotiation, staff, academy, free facility placement or daily club simulation.

## First development pass

Implemented a clubhouse with animated squad figures and links to real facility/squad screens; a lighter, more readable responsive UI; next-fixture summary; five recent results; six one-time rewarded goals; persistent career saving with safe pre-match restoration; a skip-to-result action; an actual Node test suite and idle balance runner. Fixed the match projection cache to include every player stat, unreadable team names on the match scoreboard, repeated first commentary line, HUD icons after loading, and requests for absent optional art.

The club scene is an initial interface, not the finished living base. Its player animation is decorative. Facility level labels reflect actual upgrades; construction/expansion animation is future work. All original match mechanics and starting balance remain, with additional one-time goal rewards. These rewards need playtesting for pacing.

## Second development pass: weekly club management

Implemented one preparation week per league match. Every player gets one activity: free team practice (+2 XP), coached stat growth (+1 stat and +4 XP, with the existing high-level training bonus), treatment, fan outreach, or rest. Plans show costs before spending, enforce shared capacity, reject invalid plans without partial application, and lock after completion. The progress report attributes every actual gain to a named player. The next match opens a fresh week.

Training-ground upgrades now add coaching places and reduce coaching prices. The new clinic has three upgrades, more treatment places, cheaper care and faster recovery at level 2. Stadium upgrades add outreach places while retaining their match-income effects. Treatment uses the Undead discount. Instant healing is still available. Saved plans and completed reports survive reloads, and version-one careers migrate with their already-used coaching slots preserved.

Validated with 12 Node tests, including mixed activities, budgets, capacities, injuries, level-ups, deterministic bonuses, roster changes, multi-season reports, idempotence and save migration. Browser verification completed a season through real weekly/match controls, tested reloads, clinic recovery, the squad shortcut and all seven management screens at 390px. A diagnostic 240-season run used free practice, not optimized coaching, and is not a balance verdict.

## Next priorities

1. **A living club.** The weekly planning and facility mechanics now exist. Next, connect the generated artwork to a compact overhead or isometric ground, show players at their assigned stations, add construction feedback, and consider staff/scouting activities. Free placement and real-time activity are still future work.
2. **Meaningful coaching choices.** Select the starting five and substitutes. Introduce a few understandable tactical plans (power running, passing, pressure defense) with matchup-specific tradeoffs. Wire them into simulation and show their effects in match events; avoid cosmetic buttons or a universally best setting.
3. **Player attachment.** Season and career statistics, named achievements, distinct growth potential and skills, standout moments, and a post-match player report. Make hiring a rookie and developing a star feel different from buying four numbers.
4. **A progression ladder.** Local leagues leading to harder competitions, promotions and relegation, unlockable opponents/facilities/staff, and milestone celebrations. Replace endless flat stat boosts with authored stages and meaningful unlocks.
5. **Readable, lively matches.** Strong possession cues, formation-aware movement, better spacing, clearer play outcomes, substitutions and concise highlights. Existing art is painted rather than Kairosoft-style pixel art; decide on a consistent miniature-character direction before commissioning an entire replacement set.
6. **Economy and pacing.** Simulate and play coached seasons, evaluate races/strategies and catch dominant choices. Add sponsor deals/fan events only when they create a useful decision. The 20-season-per-team free-practice baseline is diagnostic, not proof of fair or fun balance.
7. **Production reliability.** Lazy-load the selected team/opponent instead of preloading most of 49 MB of art, compress assets, portable save backups/migrations, automated browser tests in CI, accessible match text, and a deeper mobile interaction pass.

## Validation of this pass

Node tests cover all twelve teams, deterministic save round trips, training persistence, match history, goal claims without duplicate rewards, full seasons, idempotent finals, next seasons, corrupted saves and unavailable storage. Browser checks cover reloads before/after matches, pause, training, reward persistence, six management tabs at a 390px viewport, a complete season, next season and restart. No JavaScript errors or failed art requests occurred during that browser run.

This is the first development slice, not a finished Kairosoft-scale game.
