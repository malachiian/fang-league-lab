# Direction: a club you want to come back to

The target is a charming club-building management game with brutal fantasy football characters. The repeated loop should be: plan the week, develop players, watch recognizable choices play out, collect rewards, unlock a new possibility, and want one more match.

## What the inherited game actually has

Twelve original teams with race stats/traits and four position types each; two six-team divisions; ten fixtures per season; a cup final; gold and fans; recruitment and rerolls; individual stat training; player XP and levels; healing; stadium and training-ground upgrades; automatic five-player lineup selection; seeded match outcomes; event-driven side-view match playback; multiple seasons. 282 PNGs provide art for all twelve teams. It is a playable prototype, with a clean separation between simulation and presentation.

The inherited matches were automatic rating checks followed by generated events and animation. The third development pass below replaces that engine. The competition still repeats with rival stats increased; there is no promotion ladder, sponsor negotiation, staff, academy, free facility placement or daily club simulation.

## First development pass

Implemented a clubhouse with animated squad figures and links to real facility/squad screens; a lighter, more readable responsive UI; next-fixture summary; five recent results; six one-time rewarded goals; persistent career saving with safe pre-match restoration; a skip-to-result action; an actual Node test suite and idle balance runner. Fixed the match projection cache to include every player stat, unreadable team names on the match scoreboard, repeated first commentary line, HUD icons after loading, and requests for absent optional art.

The club scene is an initial interface, not the finished living base. Its player animation is decorative. Facility level labels reflect actual upgrades; construction/expansion animation is future work. All original match mechanics and starting balance remain, with additional one-time goal rewards. These rewards need playtesting for pacing.

## Second development pass: weekly club management

Implemented one preparation week per league match. Every player gets one activity: free team practice (+2 XP), coached stat growth (+1 stat and +4 XP, with the existing high-level training bonus), treatment, fan outreach, or rest. Plans show costs before spending, enforce shared capacity, reject invalid plans without partial application, and lock after completion. The progress report attributes every actual gain to a named player. The next match opens a fresh week.

Training-ground upgrades now add coaching places and reduce coaching prices. The new clinic has three upgrades, more treatment places, cheaper care and faster recovery at level 2. Stadium upgrades add outreach places while retaining their match-income effects. Treatment uses the Undead discount. Instant healing is still available. Saved plans and completed reports survive reloads, and version-one careers migrate with their already-used coaching slots preserved.

Validated with 12 Node tests, including mixed activities, budgets, capacities, injuries, level-ups, deterministic bonuses, roster changes, multi-season reports, idempotence and save migration. Browser verification completed a season through real weekly/match controls, tested reloads, clinic recovery, the squad shortcut and all seven management screens at 390px. A diagnostic 240-season run used free practice, not optimized coaching, and is not a balance verdict.

## Third development pass: matches for the showcase

The immediate goal is an engaging few minutes on screen. The new deterministic spatial engine resolves movement, blocking, handoffs, pass flight, catches, interceptions, tackles, loose-ball recoveries and counterattacks. Six alternating possessions can extend to two overtime possessions. Injuries remove players; fit reserves enter at the next possession. The actual simulation generates the recorded positions and events used by playback.

Coaches can choose five starters and power running, wide passing or pressure/counter tactics. Stats affect movement and contests directly, so weekly training feeds into match behavior. The broadcast adds a following camera, possession/clock/score graphics, contact effects, expression portraits, touchdown celebrations, slow-motion replays, fullscreen and a report with statistics, player of the match and turning points. Exhibition mode reaches the action without advancing a career. The opening Orcs/Elves seed gives a repeatable showcase using real simulation outcomes.

New artwork fills all missing portrait expressions and provides grounds plus four levels each of training/stadium artwork. The clubhouse uses the building images. Team sprite sets now load on demand, and match playback waits for their decode.

Validation covers deterministic recorded/headless results, no input mutation, score/event consistency, finite in-bounds positions, equal overtime opportunities, injury removal, chosen starters, tactic differences, save validation and lineup cleanup after releasing a player. Browser checks complete a match with eight auto replays, a manual replay, all 12 teams, fullscreen/pause/speed controls, return to an unchanged career and mobile layouts. Full weekly/season regression still passes. These checks establish behavior and reliability, not finished competitive balance.

## Next priorities after this match update

1. **Signature players.** A small set of visible abilities, such as a charging blocker, evasive runner or precise passer, plus distinctive celebrations. Tie each effect to an understandable tradeoff and a clear on-field cue.
2. **A coaching moment.** One limited call per match, such as protect the lead or commit to an all-out attack. It should change positioning and risk immediately, with enough time to read the outcome.
3. **Sound and animation polish.** Crowd reactions, distinct pass/catch/impact sounds, stronger run cycles and quieter idle moments. Continue improving spacing and ball readability from actual captured play.
4. **Visible weekly development.** Put assigned players at their training stations and show an individual improvement before its next match. Add modest construction and upgrade celebrations.
5. **Player memory.** Persist season statistics, milestones and memorable rivalries. The current player-of-the-match report is per match; long-term player records remain future work.

Promotion ladders, staff trees, sponsors and a larger economy can wait until the short playable showcase is compelling. Race/tactic balance needs coached playtesting; mobile portrait matches are functional but landscape/fullscreen is the presentation target.

## Validation of this pass

Node tests cover all twelve teams, deterministic save round trips, training persistence, match history, goal claims without duplicate rewards, full seasons, idempotent finals, next seasons, corrupted saves and unavailable storage. Browser checks cover reloads before/after matches, pause, training, reward persistence, six management tabs at a 390px viewport, a complete season, next season and restart. No JavaScript errors or failed art requests occurred during that browser run.

This is the first development slice, not a finished Kairosoft-scale game.
