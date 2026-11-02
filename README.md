# Fang League: Club Manager development edition

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

Tests use Node's built-in test runner. The balance report runs 20 idle-player seasons per team with the existing opponent AI management; it is not a coached-play balance verdict.

## Play

Choose one of 12 teams, build your club, recruit and train players, then watch five-a-side matches. Ten matches decide each six-team division. Division champions meet in a cup final. Squads, gold, fans and facilities carry into future seasons, with tougher rivals.

- **Clubhouse:** interactive grounds, next fixture, recent results and six one-time rewarded ambitions.
- **Squad:** seven starting players, up to ten on the roster; stats, XP, levels, injuries, healing and three training sessions between matches.
- **Recruit:** a three-player scouting pool and paid rerolls.
- **Upgrades:** three levels each of training ground and stadium, affecting training/healing prices and income.
- **League:** two divisions, standings and cup qualification.
- **Match:** projected results from 40 sample simulations, automatic lineup, animated playback, pause, 1x/2x/4x and skip to result.

The clubhouse players are ambient animation, not a passive training simulation. Upgrades are functional, but free building placement and facility activity do not exist yet.

## Saving

Career state saves to this browser's localStorage after management actions and results. Refresh during playback returns to the saved pre-match state: replay uses the same seed, and rewards are not applied twice. Refresh after a result retains the result and opens the clubhouse (or season review). Restart requires confirmation and clears this edition's save.

Saves are local to the browser and site origin, not synced across devices. Clearing browser storage deletes the save. Invalid saves are left intact until a new club is started. When storage fails, the footer reports the failure. There is no import/export or cloud account yet.

## Code

- `src/data.js`: teams, economy, player generation and progression.
- `src/match.js`: deterministic automatic match simulation, independent of DOM.
- `src/season.js`: schedule, league results, roster transactions, history and season advancement.
- `src/club.js`: one-time club goals and rewards.
- `src/save.js`: versioned persistence and validation.
- `src/game.js`: screens, interaction and canvas playback.
- `src/assets.js`: manifest of supplied PNGs. The loader skips unavailable optional expressions/poses and uses existing fallback art. Update this manifest when adding images.
- `src/club.css`: clubhouse presentation and responsive layouts.

## Art

The repository includes 282 PNGs (about 49 MB): team crests, pitch, painted player bodies/poses, neutral portraits and supporting art. Many alternate portrait expressions are not supplied; these fall back to neutral. All twelve teams have painted assets. Press M to inspect failed requests for supplied art.

See [ROADMAP.md](ROADMAP.md) for the design assessment and next steps.
