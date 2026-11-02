import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, playerTeam, resolveRound, nextSeason, upgrade, heal, release, sign, train } from '../src/season.js';
import { STATS, trainingCost, BALANCE } from '../src/data.js';
import { assignActivity, previewWeek, advanceWeek, readyForMatch, capacities, recoveryDetails } from '../src/weekly.js';
import { loadCareer, saveCareer, SAVE_KEY } from '../src/save.js';

const setup = (race='humans') => { const game = newGame(race, 923); return {game,team:playerTeam(game)}; };
const clone = data => JSON.parse(JSON.stringify(data));
function memory() {
  const values = new Map();
  return { getItem: k => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
}

test('a mixed week applies the advertised costs, growth, injury reduction and fans once', () => {
  const {game,team} = setup();
  const [athlete,patient,ambassador,regular] = team.players;
  patient.injury = 2;
  const before = clone(team);
  assert.equal(assignActivity(game,athlete.id,'strength').ok,true);
  assert.equal(assignActivity(game,patient.id,'recovery').ok,true);
  assert.equal(assignActivity(game,ambassador.id,'outreach').ok,true);
  assert.deepEqual(team,before,'Planning does not mutate players or spend gold');
  const expectedCost = trainingCost(athlete.stats.strength,0)+8;
  assert.equal(previewWeek(game).cost,expectedCost);
  assert.equal(advanceWeek(game).ok,true);
  assert.equal(athlete.stats.strength,before.players[0].stats.strength+1);
  assert.equal(athlete.xp,4);
  assert.equal(patient.injury,1);
  assert.equal(ambassador.xp,0);
  assert.equal(regular.xp,2);
  assert.equal(team.fans,before.fans+1);
  assert.equal(team.gold,before.gold-expectedCost);
  assert.equal(game.week.report.entries.length,team.players.length);
  const finished=clone(game);
  assert.equal(advanceWeek(game).ok,false);
  assert.equal(assignActivity(game,athlete.id,'passing').ok,false);
  assert.equal(train(game,athlete.id,'passing').ok,false);
  assert.deepEqual(game,finished);
});

test('over-capacity and unaffordable plans reject atomically, but can be revised', () => {
  const {game,team}=setup();
  team.gold=500;
  team.players.slice(0,4).forEach(p=>assignActivity(game,p.id,'strength'));
  let before=clone(game);
  assert.equal(advanceWeek(game).ok,false);
  assert.deepEqual(game,before);
  assert.match(previewWeek(game).errors.join(' '),/4 places; 3 available/);
  assignActivity(game,team.players[3].id,'practice');
  team.gold=0;
  before=clone(game);
  assert.equal(advanceWeek(game).ok,false);
  assert.deepEqual(game,before);
  team.players.forEach(p=>assignActivity(game,p.id,'practice'));
  assert.equal(advanceWeek(game).ok,true,'A penniless club can always prepare');
  assert.equal(team.gold,0);
});

test('facility upgrades immediately affect planning, never reopen a completed week', () => {
  const {game,team}=setup(); team.gold=5000;
  assert.equal(upgrade(game,'training').ok,true);
  assert.equal(previewWeek(game).limits.training,4);
  assert.equal(upgrade(game,'clinic').ok,true);
  assert.equal(recoveryDetails(team).cost,6);
  assert.equal(capacities(team).recovery,2);
  upgrade(game,'clinic');
  assert.equal(recoveryDetails(team).gain,2);
  const patient=team.players[0]; patient.injury=2;
  assignActivity(game,patient.id,'recovery');
  advanceWeek(game);
  assert.equal(patient.injury,0,'Treatment can return an injured player before kickoff');
  upgrade(game,'training');
  assert.equal(game.trainsLeft,0);
  assert.equal(advanceWeek(game).ok,false);
  resolveRound(game);
  assert.equal(game.trainsLeft,5);
  assert.equal(game.week.status,'planning');
  assert.deepEqual(game.week.assignments,{});
  const oldGold=team.gold;
  assert.equal(upgrade(game,'banana').ok,false);
  assert.equal(team.gold,oldGold);
  const undead=setup('undead');
  assert.equal(recoveryDetails(undead.team).cost,4,'Undead healing discount also applies to weekly treatment');
});

test('injury restrictions, stat caps, level-ups and deterministic training bonuses', () => {
  const {game,team}=setup();
  const p=team.players[0];p.injury=1;
  assert.equal(assignActivity(game,p.id,'speed').ok,false);
  assert.equal(assignActivity(game,p.id,'outreach').ok,false);
  assert.equal(assignActivity(game,team.players[1].id,'recovery').ok,false);
  p.injury=0;p.stats.speed=20;
  assert.equal(assignActivity(game,p.id,'speed').ok,false);
  p.xp=29;p.stats.strength=19;team.trainingLevel=2;
  assignActivity(game,p.id,'strength');
  const same=clone(game);
  advanceWeek(game);advanceWeek(same);
  assert.deepEqual(game,same);
  assert.equal(p.stats.strength,20);
  assert.equal(p.level,2);
  assert.ok(STATS.every(stat=>p.stats[stat]<=20));
  assert.ok(game.week.report.entries[0].gains.some(g=>g.includes('Level')));
});

test('match progression requires preparation, resets the plan and retains reports', () => {
  const {game,team}=setup();
  const before=clone(game);
  assert.deepEqual(resolveRound(game),[]);
  assert.deepEqual(game,before);
  advanceWeek(game);
  assert.equal(readyForMatch(game),true);
  resolveRound(game);
  assert.equal(game.round,1);
  assert.equal(readyForMatch(game),false);
  assert.equal(game.clubReports.length,1);
  assert.equal(game.week.report,null);
  for(let season=0;season<2;season++) {
    while(game.phase==='league') { advanceWeek(game);resolveRound(game); }
    assert.equal(game.round,10);
    nextSeason(game);
  }
  assert.equal(game.clubReports.length,12,'Report history is bounded');
  assert.equal(game.week.key,`${game.season}:0`);
  assert.equal(team.gold>=0,true);
});

test('roster changes remove stale assignments and healed players return to practice', () => {
  const {game,team}=setup();team.gold=3000;
  const p=team.players[0];p.injury=1;
  assignActivity(game,p.id,'recovery');
  assert.equal(heal(game,p.id).ok,true);
  assert.equal(previewWeek(game).rows[0].activity,'practice');
  assert.equal(sign(game,0).ok,true);
  const recruit=team.players.at(-1);
  assert.equal(assignActivity(game,recruit.id,'passing').ok,true);
  assert.equal(release(game,recruit.id).ok,true);
  assert.equal(recruit.id in game.week.assignments,false);
  const store=memory();saveCareer(store,game,{screen:'hub',tab:'week'});
  assert.deepEqual(loadCareer(store).game,game);
});

test('version-one migration preserves career and spent slots, with a recovery copy', () => {
  const {game,team}=setup();
  train(game,team.players[0].id,'passing');
  delete game.week;delete game.clubReports;
  game.teams.forEach(t=>delete t.clinicLevel);
  const old=clone(game);
  const store=memory();const raw=JSON.stringify({version:1,game,tab:'squad'});
  store.setItem(SAVE_KEY,raw);
  const loaded=loadCareer(store).game;
  assert.ok(loaded);
  assert.equal(loaded.trainsLeft,2);
  assert.deepEqual(loaded.teams[0].players,old.teams[0].players);
  assert.equal(loaded.teams.find(t=>t.isPlayer).gold,team.gold);
  assert.equal(loaded.week.status,'planning');
  assert.equal(store.getItem(`${SAVE_KEY}.backup-v1`),raw);
  saveCareer(store,loaded,{screen:'hub',tab:'week'});
  assert.equal(JSON.parse(store.getItem(SAVE_KEY)).version,2);
  assert.deepEqual(loadCareer(store).game,loaded);
});

test('planned and completed weeks survive reloads without replaying progress', () => {
  const {game,team}=setup();const store=memory();
  assignActivity(game,team.players[0].id,'passing');
  saveCareer(store,game,{screen:'hub',tab:'week'});
  const planned=loadCareer(store).game;
  assert.deepEqual(planned,game);
  advanceWeek(planned);
  saveCareer(store,planned,{screen:'hub',tab:'week'});
  const ready=loadCareer(store).game;
  assert.deepEqual(ready,planned);
  assert.equal(advanceWeek(ready).ok,false);
  assert.deepEqual(ready,planned);
  ready.week.assignments['not-a-player']='practice';
  store.setItem(SAVE_KEY,JSON.stringify({version:2,game:ready}));
  assert.equal(loadCareer(store).game,null);
});
