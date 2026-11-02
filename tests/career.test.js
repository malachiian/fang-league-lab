import test from 'node:test';
import assert from 'node:assert/strict';
import { RACES } from '../src/data.js';
import { newGame, playerTeam, resolveRound, resolveFinal, nextSeason, train, playerFixture, fixtureSeed, simById } from '../src/season.js';
import { claimGoal } from '../src/club.js';
import { advanceWeek } from '../src/weekly.js';
import { SAVE_KEY, saveCareer, loadCareer, clearCareer } from '../src/save.js';

function memory() {
  const values = new Map();
  return { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
}

test('all 12 teams retain training, gold and deterministic results across saves', () => {
  for (const race of RACES) {
    const game = newGame(race.id, 1234);
    train(game, playerTeam(game).players[0].id, 'strength');
    const store = memory();
    assert.equal(saveCareer(store, game, { screen:'hub', tab:'club' }).ok, true);
    const restored = loadCareer(store).game;
    assert.deepEqual(restored, game);
    const [a,b] = playerFixture(game);
    const seed = fixtureSeed(game, game.round, a, b);
    assert.deepEqual(simById(restored, a, b, seed), simById(game, a, b, seed));
  }
});

test('refresh during playback preserves the pre-match career', () => {
  const store = memory();
  const game = newGame('orcs', 42);
  saveCareer(store, game, {screen:'hub',tab:'match'});
  const before = store.getItem(SAVE_KEY);
  assert.equal(saveCareer(store, game, {screen:'match'}).skipped, true);
  assert.equal(store.getItem(SAVE_KEY), before);
});

test('full seasons retain history and goals, without duplicate rewards', () => {
  for (const race of RACES) {
    const game = newGame(race.id, 42);
    assert.equal(claimGoal(game, 'debut').ok, false);
    advanceWeek(game);
    resolveRound(game);
    assert.equal(game.history.length, 1);
    const gold = playerTeam(game).gold;
    assert.equal(claimGoal(game, 'debut').reward, 30);
    assert.equal(claimGoal(game, 'debut').ok, false);
    assert.equal(playerTeam(game).gold, gold + 30);
    for (let i=1;i<10;i++) { advanceWeek(game); resolveRound(game); }
    assert.equal(game.phase, 'review');
    assert.equal(game.history.length, 10);
    const me = playerTeam(game);
    assert.equal(me.won + me.drawn + me.lost, 10);
    assert.equal(game.history.reduce((s,m)=>s+m.us,0), me.pf);
    const store = memory();
    saveCareer(store, game, {screen:'review'});
    assert.deepEqual(loadCareer(store).game, game);
    resolveFinal(game);
    const afterFinal = JSON.stringify(game);
    resolveFinal(game);
    assert.equal(JSON.stringify(game), afterFinal);
    saveCareer(store, game, {screen:'done'});
    assert.deepEqual(loadCareer(store).game, game);
    nextSeason(game);
    assert.equal(game.season, 2);
    assert.equal(game.history.length, 10);
    assert.equal(claimGoal(game, 'debut').ok, false);
    assert.ok(me.players.every(p=>p.injury === 0));
  }
});

test('corrupt, incompatible and inaccessible saves fail gracefully', () => {
  const store = memory();
  for (const raw of ['{bad', '{}', '{"version":9}', '{"version":1,"game":{"season":1}}']) {
    store.setItem(SAVE_KEY, raw);
    assert.equal(loadCareer(store).game, null);
    assert.ok(loadCareer(store).message);
    assert.equal(store.getItem(SAVE_KEY), raw);
  }
  const blocked = {getItem(){throw Error('blocked');}, setItem(){throw Error('quota');}, removeItem(){throw Error('blocked');}};
  assert.equal(saveCareer(blocked,newGame('orcs',1),{screen:'hub'}).ok,false);
  assert.equal(loadCareer(blocked).game,null);
  assert.equal(clearCareer(blocked),false);
  assert.equal(clearCareer(store),true);
  assert.equal(loadCareer(store).game,null);
});
