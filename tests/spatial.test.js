import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, release, sign } from '../src/season.js';
import { simulateMatch, pickLineup } from '../src/match.js';
import { sampleFrame } from '../src/match-view.js';
import { SAVE_KEY, saveCareer, loadCareer } from '../src/save.js';

function fixture() {
  const { teams } = newGame('orcs', 42);
  const a = teams.find(t => t.id === 'orcs');
  const b = teams.find(t => t.id === 'elves');
  a.tactic = 'power'; b.tactic = 'spread';
  return [a, b];
}

test('spatial results are deterministic, do not mutate teams, and do not depend on recording', () => {
  const [a,b] = fixture(), before = structuredClone([a,b]);
  const first = simulateMatch(a,b,3);
  assert.deepEqual(simulateMatch(a,b,3), first);
  assert.deepEqual([a,b], before);
  assert.deepEqual(simulateMatch(a,b,3,{record:false}), {...first, frames:[]});
  assert.ok(first.frames.length > 100);
});

test('recorded possessions, scores, bodies and ball remain consistent across teams and seeds', () => {
  const {teams} = newGame('orcs',42);
  for (let i=0;i<teams.length;i++) for (const seed of [1,3,7]) {
    const [a,b] = [teams[i],teams[(i+5)%teams.length]], res = simulateMatch(a,b,seed);
    const ids = new Set([...a.players,...b.players].map(p=>p.id));
    for (const side of ['A','B']) {
      assert.equal(res[`score${side}`],res.events.filter(e=>e.type==='touchdown'&&e.team===side).length);
      assert.equal(res.stats[side].touchdowns,res[`score${side}`]);
      assert.ok(res.stats[side].completions<=res.stats[side].passes);
    }
    const kicks = res.events.filter(e=>e.type==='kickoff');
    assert.ok([6,8].includes(kicks.length));
    assert.equal(kicks.filter(e=>e.team==='A').length,kicks.filter(e=>e.team==='B').length);
    for (let j=0;j<res.frames.length;j++) {
      const f=res.frames[j];
      assert.ok(f.t>=0&&f.t<=res.duration&&(!j||f.t>=res.frames[j-1].t));
      assert.ok(f.remaining>=0&&f.remaining<=24);
      assert.equal(new Set(f.players.map(p=>p.id)).size,f.players.length);
      for (const p of [...f.players,f.ball]) {
        assert.ok(Number.isFinite(p.x)&&p.x>=0&&p.x<=100);
        assert.ok(Number.isFinite(p.y)&&p.y>=0&&p.y<=60);
      }
      for (const p of f.players) assert.ok(ids.has(p.id));
      if(f.ball.mode==='held') assert.ok(f.players.some(p=>p.id===f.ball.owner&&!p.out));
      assert.ok(f.scoreA<=res.scoreA&&f.scoreB<=res.scoreB);
    }
    for(const c of res.casualties) {
      assert.ok(ids.has(c.playerId));
      const injuredAt=res.events.find(e=>e.type==='casualty'&&e.targetId===c.playerId);
      assert.ok(injuredAt);
      for(const f of res.frames.filter(f=>f.drive>injuredAt.drive)) assert.ok(!f.players.some(p=>p.id===c.playerId));
    }
    const last=res.frames.at(-1);assert.equal(last.scoreA,res.scoreA);assert.equal(last.scoreB,res.scoreB);
    assert.equal(sampleFrame(res,res.duration+10).t,last.t);
  }
});

test('tactics create different decisions and chosen reserves actually take the field', () => {
  const [a,b]=fixture();
  const power=simulateMatch(a,b,3);
  assert.ok(power.events.some(e=>e.type==='handoff'));
  a.tactic='spread';
  const spread=simulateMatch(a,b,3);
  assert.notDeepEqual(spread.events,power.events);
  assert.equal(spread.events.some(e=>e.type==='handoff'),false);
  const starters=pickLineup(a.players),reserve=a.players.find(p=>!starters.includes(p));
  a.lineup=[reserve.id,...starters.slice(1).map(p=>p.id)];
  const selected=simulateMatch(a,b,3);
  assert.ok(selected.frames[0].players.some(p=>p.id===reserve.id));
  reserve.injury=1;
  assert.ok(!simulateMatch(a,b,3).playedA.includes(reserve.id));
});

test('the showcase includes live turnovers, contact, substitutions and two overtime possessions', () => {
  const [a,b]=fixture(),res=simulateMatch(a,b,3);
  for(const type of ['pass','catch','interception','handoff','block','tackle','dodge','fumble','recovery','casualty','substitution','touchdown']) {
    assert.ok(res.events.some(e=>e.type===type),type);
  }
  assert.equal(res.events.filter(e=>e.type==='kickoff').length,8);
  for(const h of res.highlights) {
    assert.ok(h.start<h.event.t&&h.end>h.event.t&&h.end<=res.duration);
  }
});

test('tactics and lineup survive saves; malformed coaching choices fail validation', () => {
  const game=newGame('orcs',42),team=game.teams.find(t=>t.id==='orcs');
  team.tactic='counter';team.lineup=team.players.slice(0,5).map(p=>p.id);
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  saveCareer(storage,game,{screen:'hub',tab:'match'});
  assert.deepEqual(loadCareer(storage).game,game);
  for(const invalid of [{lineup:42},{lineup:['missing']},{lineup:[team.players[0].id,team.players[0].id]},{tactic:'missing'}]) {
    const broken=structuredClone(game);Object.assign(broken.teams.find(t=>t.id==='orcs'),invalid);
    values.set(SAVE_KEY,JSON.stringify({version:2,game:broken}));
    assert.equal(loadCareer(storage).game,null);
  }
  const released=team.lineup[0];
  team.gold=10000;
  assert.equal(sign(game,0).ok,true);
  assert.equal(release(game,released).ok,true);
  assert.ok(!team.lineup.includes(released));
  saveCareer(storage,game,{screen:'hub',tab:'squad'});
  assert.deepEqual(loadCareer(storage).game,game);
});
