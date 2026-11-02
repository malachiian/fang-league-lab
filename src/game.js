/**
 * Fang League UI and side-view playback.
 * Match results come from simulateMatch; this file only shows them.
 */
import {
  ART,
  ASSET_OVERRIDES,
  BALANCE,
  RACES,
  STATS,
  STAT_LABEL,
  divisionName,
  facilityCost,
  healCost,
  purse,
  raceById,
  recruitCost,
  rulesLines,
  stadiumBlurb,
  trainingCost,
  trainingGroundBlurb,
  traitLabel,
} from './data.js';
import {
  finalPair,
  fixtureSeed,
  heal,
  healthyCount,
  releaseBlock,
  leagueTable,
  newGame,
  nextSeason,
  playerFixture,
  playerRank,
  playerTeam,
  release,
  rerollPool,
  resolveFinal,
  resolveRound,
  sign,
  simById,
  teamById,
  train,
  upgrade,
} from './season.js';
import { hashSeed, matchRuleText, pickLineup, simulateMatch } from './match.js';
import { clubGoals, claimGoal } from './club.js';
import { saveCareer, loadCareer, clearCareer } from './save.js';
import { ASSET_FILES } from './assets.js';

const storage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
};

const PLAYER_H = ART.playerHeight;
const PAINTED_RACES = new Set(['orcs', 'humans', 'elves', 'goblins', 'undead', 'halflings', 'dwarves', 'ratfolk', 'lizardfolk', 'darkelves', 'ogres', 'doomsworn']);
const view = document.getElementById('view');
const flashEl = document.getElementById('flash');
const images = {};
const missingArt = [];
const missingLogged = new Set();
let showMissing = false;

const ui = {
  screen: 'select',
  tab: 'club',
  selectedRace: 'orcs',
  speed: 1,
  paused: false,
  flash: '',
  trainId: null,
  releaseId: null,
  playback: null,
  post: null,
  applying: false,
  estimateKey: '',
  estimate: null,
};

let game = null;
let saveWarning = '';
let raf = 0;
let lastTick = 0;

function noteMissing(src) {
  if (missingLogged.has(src)) return;
  missingLogged.add(src);
  missingArt.push(src);
  console.warn('[fang-league] missing art:', src);
  paintMissing();
}

function want(key, src, opts = {}) {
  // Optional poses use the existing body fallback without issuing a failing request.
  if (!ASSET_FILES.has(src)) return null;
  const over = ASSET_OVERRIDES[key] || {};
  const rec = {
    key,
    src,
    ok: false,
    img: new Image(),
    pixelated: over.pixelated ?? opts.pixelated ?? false,
    frameWidth: over.frameWidth || opts.frameWidth || 0,
  };
  rec.img.onload = () => {
    rec.ok = true;
    if (key.startsWith('icon-')) renderHud();
    if (ui.screen !== 'match') paintStill();
  };
  rec.img.onerror = () => {
    rec.ok = false;
    noteMissing(src);
  };
  rec.img.src = src;
  images[key] = rec;
  return rec;
}

function loadArt() {
  want('pitch', 'assets/pitch.png', { pixelated: false });
  want('ball', 'assets/ball.png', { pixelated: true });
  want('icon-gold', 'assets/icon-gold.png', { pixelated: true });
  want('icon-fans', 'assets/icon-fans.png', { pixelated: true });
  want('stands', 'assets/stands.png', { pixelated: false });
  want('trophy', 'assets/trophy-room.png', { pixelated: false });
  for (const race of RACES) {
    want(`crest-${race.file}`, `assets/crest-${race.file}.png`, { pixelated: false });
    const painted = PAINTED_RACES.has(race.id);
    for (const pos of race.positions) {
      const stem = `${race.file}-${pos.id}`;
      want(`${stem}-idle`, `assets/${stem}-idle.png`);
      // Painted races use -idle only; the old -hd bodies still carry a painted ball.
      if (!painted) {
        want(`${stem}-hd-128`, `assets/${stem}-hd-128.png`);
        want(`${stem}-hd`, `assets/${stem}-hd.png`);
        want(stem, `assets/${stem}.png`);
      }
      want(`${stem}-run`, `assets/${stem}-run.png`);
      want(`${stem}-tackle`, `assets/${stem}-tackle.png`);
      want(`${stem}-down`, `assets/${stem}-down.png`);
      for (const expr of ART.expressions) {
        want(`${stem}-portrait-${expr}`, `assets/${stem}-portrait-${expr}.png`);
      }
    }
  }
}

function frameOf(rec, frameIndex) {
  const w = rec.img.naturalWidth || 1;
  const h = rec.img.naturalHeight || 1;
  let fw = rec.frameWidth;
  if (!fw) fw = h > 0 && w >= h * 2 && w % h === 0 ? h : w;
  const count = Math.max(1, Math.floor(w / fw));
  const index = ((frameIndex % count) + count) % count;
  return { sx: index * fw, sy: 0, sw: fw, sh: h, count };
}

function firstOk(keys) {
  return keys.map((key) => images[key]).find((rec) => rec?.ok) || null;
}

function pitchBody(race, position) {
  const stem = `${race.file}-${position}`;
  const keys = [`${stem}-idle`];
  if (!PAINTED_RACES.has(race.id)) keys.push(`${stem}-hd-128`, `${stem}-hd`, stem);
  return firstOk(keys);
}

function poseArt(race, position, pose) {
  if (pose !== 'idle') {
    const specific = images[`${race.file}-${position}-${pose}`];
    if (specific?.ok) return { rec: specific, fake: false };
  }
  return { rec: pitchBody(race, position), fake: pose !== 'idle' };
}

function portraitRecord(race, position, expression) {
  const stem = `${race.file}-${position}`;
  return firstOk([
    `${stem}-portrait-${expression}`,
    `${stem}-portrait-neutral`,
    `${stem}-idle`,
  ]) || (!PAINTED_RACES.has(race.id) ? images[stem] : null);
}

function paintMissing() {
  const box = document.getElementById('missing');
  const list = document.getElementById('missing-list');
  const count = document.getElementById('missing-count');
  if (!box || !list) return;
  box.hidden = !showMissing;
  count.textContent = missingArt.length
    ? `${missingArt.length} file${missingArt.length === 1 ? '' : 's'} 404'd. Shape stand-ins are on screen.`
    : 'Every requested file loaded.';
  list.innerHTML = missingArt.map((src) => `<li>${esc(src)}</li>`).join('');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function flash(text) {
  ui.flash = text;
  if (flashEl) flashEl.textContent = text;
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function doRestart() {
  if (!clearCareer(storage)) {
    flash('Could not clear the saved career. Please allow browser storage and try again.');
    return;
  }
  stopLoop();
  ui.speed = 1;
  ui.paused = false;
  ui.screen = 'select';
  ui.tab = 'club';
  ui.trainId = null;
  ui.releaseId = null;
  ui.playback = null;
  ui.post = null;
  ui.applying = false;
  ui.estimate = null;
  ui.estimateKey = '';
  game = null;
  flash('Speed is 1×. Pick a side.');
  render();
}

function render() {
  document.body.dataset.screen = ui.screen;
  renderHud();
  if (flashEl) flashEl.textContent = ui.flash || '';
  if (ui.screen === 'select') view.innerHTML = renderSelect();
  else if (ui.screen === 'hub') view.innerHTML = renderHub();
  else if (ui.screen === 'match') view.innerHTML = renderMatchShell();
  else if (ui.screen === 'post') view.innerHTML = renderPost();
  else if (ui.screen === 'review') view.innerHTML = renderReview();
  else if (ui.screen === 'done') view.innerHTML = renderDone();
  paintStill();
  const saved = saveCareer(storage, game, ui);
  if (!saved.skipped) saveWarning = saved.ok ? '' : saved.message;
  const saveStatus = document.getElementById('save-status');
  if (saveStatus) saveStatus.textContent = saveWarning || (!game ? 'Your club starts here' : ui.screen === 'match' ? 'Career saved before kickoff' : 'Career saved on this browser');
  const speedBtn = document.getElementById('speed');
  const pauseBtn = document.getElementById('pause');
  const onMatch = ui.screen === 'match';
  if (speedBtn) {
    speedBtn.hidden = !onMatch;
    speedBtn.textContent = `Speed ${ui.speed}×`;
  }
  if (pauseBtn) {
    pauseBtn.hidden = !onMatch;
    pauseBtn.textContent = ui.paused ? 'Resume' : 'Pause';
  }
}

function icon(name, alt) {
  const rec = images[`icon-${name}`];
  if (rec?.ok) {
    const crisp = rec.pixelated ? 'pixelated' : 'auto';
    return `<img src="${rec.src}" width="32" height="32" alt="${alt}" style="image-rendering:${crisp}">`;
  }
  const color = name === 'gold' ? '#f0c14a' : '#e15d5d';
  return `<span class="fallback-icon" style="background:${color};border:2px solid #000" title="${alt}"></span>`;
}

function renderHud() {
  const gold = document.getElementById('hud-gold');
  const fans = document.getElementById('hud-fans');
  const match = document.getElementById('hud-match');
  const rank = document.getElementById('hud-rank');
  if (!game) {
    gold.innerHTML = `${icon('gold', 'Gold')} Gold —`;
    fans.innerHTML = `${icon('fans', 'Fans')} Fans —`;
    match.textContent = 'Preseason';
    rank.textContent = 'Pick a team';
    const hud = document.getElementById('hud');
    if (hud) hud.style.boxShadow = '';
    return;
  }
  const team = playerTeam(game);
  const accent = raceById(team.race).colors.primary;
  gold.innerHTML = `${icon('gold', 'Gold')} ${team.gold}g`;
  fans.innerHTML = `${icon('fans', 'Fans')} ${team.fans} fans`;
  if (game.phase === 'league') match.textContent = `Match ${game.round + 1} / ${game.schedule.length}`;
  else if (game.phase === 'review') match.textContent = playerRank(game).champion ? 'Cup spot won' : 'Season over';
  else match.textContent = 'Cup final';
  const hud = document.getElementById('hud');
  if (hud) hud.style.boxShadow = `inset 6px 0 0 ${accent}`;
  const played = team.won + team.drawn + team.lost;
  if (!played) rank.textContent = `${team.short} · preseason`;
  else {
    const place = playerRank(game);
    rank.innerHTML = `<span class="swatch" style="background:${accent}"></span> ${place.tied ? 'T-' : ''}${ordinal(place.rank)} in ${esc(divisionName(place.division))}`;
  }
}

function renderSelect() {
  const cards = RACES.map((race) => {
    const on = race.id === ui.selectedRace ? ' on' : '';
    const roles = race.positions.map((p) => `${p.count} ${p.label}`).join(' · ');
    return `<button type="button" class="card${on}" data-act="pick" data-race="${race.id}" style="border-left:8px solid ${race.colors.primary}">
      <div class="who">
        <canvas class="face" width="96" height="120" data-face="${race.id}"></canvas>
        <div>
          <h2>${esc(race.team)}</h2>
          <p class="style">${esc(race.name)}: ${esc(race.style)}</p>
          <p class="muted">${esc(divisionName(race.division))}</p>
        </div>
      </div>
      <p class="muted">${esc(traitLabel(race.trait))}</p>
      <p class="muted">${esc(roles)}. Recruits from ${race.recruitCost}g.</p>
    </button>`;
  }).join('');
  const race = raceById(ui.selectedRace);
  return `<div class="intro"><p class="eyebrow">A small club. A big ambition.</p><h2>Build a team worth cheering for.</h2><p>Recruit misfits. Train your stars. Grow your home ground. Then watch them fight for the cup.</p></div>
    <div class="hero panel" style="border-left:8px solid ${race.colors.primary}">
      <canvas class="face" width="220" height="260" data-face="${race.id}"></canvas>
      <div>
        <h2>${esc(race.team)}</h2>
        <p class="style">${esc(race.name)}: ${esc(race.style)}</p>
        <p class="muted">${esc(divisionName(race.division))}. ${esc(traitLabel(race.trait))}</p>
        <button type="button" class="ember" data-act="lead">Lead the ${esc(race.team)}</button>
      </div>
    </div>
    <div class="section-heading"><h2>Choose your club</h2><span>12 teams · 2 divisions · 1 cup</span></div><div class="grid team-grid">${cards}</div>`;
}

function renderHub() {
  const team = playerTeam(game);
  const race = raceById(team.race);
  const tabs = [
    ['club', 'Clubhouse'],
    ['squad', 'Squad'],
    ['recruit', 'Recruit'],
    ['upgrades', 'Upgrades'],
    ['league', 'League'],
    ['match', 'Match'],
  ].map(([id, label]) => `<button type="button" class="tab${ui.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}</button>`).join('');
  let body = '';
  if (ui.tab === 'club') body = renderClub(team, race);
  else if (ui.tab === 'squad') body = renderSquad(team, race);
  else if (ui.tab === 'recruit') body = renderRecruit(team);
  else if (ui.tab === 'upgrades') body = renderUpgrades(team);
  else if (ui.tab === 'league') body = renderTable();
  else body = renderMatchup(team);
  const fx = playerFixture(game);
  let banner = 'The table is set.';
  if (fx) {
    const opp = teamById(game, fx[0] === team.id ? fx[1] : fx[0]);
    banner = `Next: ${esc(opp.name)} (${esc(raceById(opp.race).name)}: ${esc(raceById(opp.race).style)}).`;
  }
  return `<div class="club-heading"><div><p class="eyebrow">Season ${game.season} · ${esc(divisionName(team.division))}</p><h2>${esc(team.name)}</h2></div><p class="muted">${banner}</p></div>
    <nav class="tabs" aria-label="Club management">${tabs}</nav>${body}`;
}

function renderClub(team, race) {
  const fx = playerFixture(game);
  const opponent = fx && teamById(game, fx[0] === team.id ? fx[1] : fx[0]);
  const fit = healthyCount(team);
  const history = (game.history || []).slice(-5).reverse();
  const goals = clubGoals(game);
  const complete = goals.filter(g => g.claimed).length;
  const lineup = pickLineup(team.players);
  const players = lineup.map((p, i) => `<img class="practice-player player-${i}" src="assets/${race.file}-${p.position}-idle.png" alt="${esc(p.name)} practicing" style="--i:${i}">`).join('');
  const facilities = [['training', 'Training ground', team.trainingLevel], ['stadium', 'Stadium', team.stadiumLevel]].map(([id, label, level]) => `<button class="ground-building ${id}" data-act="tab" data-tab="upgrades"><span class="building-roof"></span><strong>${label}</strong><span>Level ${level} / 3</span></button>`).join('');
  const results = history.map(m => `<li><span class="result-badge ${m.us > m.them ? 'win' : m.us < m.them ? 'loss' : 'draw'}">${m.us > m.them ? 'W' : m.us < m.them ? 'L' : 'D'}</span><span>${esc(teamById(game, m.opponentId).short)}<small>Season ${m.season} · Match ${m.round}</small></span><strong>${m.us} : ${m.them}</strong></li>`).join('');
  const goalCards = goals.map(g => `<article class="goal ${g.claimed ? 'claimed' : ''}"><div class="goal-top"><span>${g.claimed ? 'Completed' : g.complete ? 'Reward ready' : 'Club goal'}</span><strong>+${g.reward}g</strong></div><h3>${esc(g.name)}</h3><p>${esc(g.detail)}</p><progress max="${g.target}" value="${Math.min(g.target, g.value)}" aria-label="${esc(g.name)}"></progress><div class="goal-bottom"><span>${Math.min(g.target, g.value)} / ${g.target}</span>${g.claimed ? '<span>Collected ✓</span>' : `<button data-act="claim" data-goal="${g.id}" ${g.complete ? '' : 'disabled'}>Collect</button>`}</div></article>`).join('');
  return `<div class="club-layout"><section class="grounds panel"><div class="section-heading"><div><p class="eyebrow">Home sweet home</p><h2>Your club grounds</h2></div><span class="badge">${team.fans} fans</span></div><div class="ground-scene" aria-label="Club grounds with links to facilities and squad"><div class="ground-path"></div>${facilities}<button class="practice-pitch" data-act="tab" data-tab="squad" aria-label="Manage the squad"><span class="halfway"></span><span class="center-circle"></span>${players}<span class="pitch-caption">Meet your squad</span></button><span class="ground-sign">${esc(team.short)} FC</span></div><div class="ground-summary"><span><strong>${team.players.length}</strong> players</span><span><strong>${fit}</strong> fit to play</span><span><strong>${game.trainsLeft}</strong> training sessions</span></div></section><aside class="club-sidebar"><section class="panel fixture-card"><p class="eyebrow">Next up · Match ${game.round + 1} of 10</p><h2>${opponent ? esc(opponent.name) : 'Season complete'}</h2><p class="muted">${opponent ? esc(raceById(opponent.race).style) : 'Time to celebrate.'}</p><p>${fit < 5 ? `Only ${fit} fit. Visit the squad to heal injured players.` : 'Your team is ready to take the field.'}</p><button class="ember" data-act="tab" data-tab="match">Prepare for match →</button></section><section class="panel"><h2>Recent form</h2>${results ? `<ul class="form-list">${results}</ul>` : '<p class="muted">A new badge. A blank record. Your story starts with the first whistle.</p>'}<p class="muted">${game.titles} division titles · ${game.cups} cups</p></section></aside></div><div class="section-heading"><div><p class="eyebrow">Build something that lasts</p><h2>Club ambitions</h2></div><span>${complete} of ${goals.length} achieved</span></div><div class="goals-grid">${goalCards}</div>`;
}

function statLine(player) {
  return STATS.map((s) => `<span>${STAT_LABEL[s]} ${player.stats[s]}/${BALANCE.statCap}</span>`).join('');
}

function renderSquad(team, race) {
  const starters = new Set(pickLineup(team.players).map((p) => p.id));
  const fit = healthyCount(team);
  const cards = team.players.map((p) => {
    const hurt = p.injury > 0;
    const healPrice = hurt ? healCost(p.injury, team.trainingLevel, team.trait) : 0;
    const canHeal = hurt && team.gold >= healPrice;
    const dropReason = releaseBlock(team, p.id);
    const canDrop = !dropReason;
    const sessionsLeft = game.trainsLeft ?? 0;
    const trainOpen = ui.trainId === p.id;
    const releaseOpen = ui.releaseId === p.id;
    const trains = STATS.map((s) => {
      const cost = trainingCost(p.stats[s], team.trainingLevel);
      const capped = p.stats[s] >= BALANCE.statCap;
      const afford = sessionsLeft > 0 && team.gold >= cost && !capped;
      const why = sessionsLeft <= 0
        ? `No sessions left (${BALANCE.trainsPerWeek} per week).`
        : capped ? `At the cap (${BALANCE.statCap})` : `Need ${cost}g`;
      return `<button type="button" data-act="train" data-id="${esc(p.id)}" data-stat="${s}" ${afford ? '' : 'disabled'} title="${esc(why)}">${STAT_LABEL[s]} ${p.stats[s]}→${Math.min(BALANCE.statCap, p.stats[s] + 1)} · ${cost}g</button>`;
    }).join('');
    return `<article class="card" style="border-left:8px solid ${race.colors.primary}">
      <div class="who">
        <canvas class="portrait" width="140" height="180" data-portrait="${esc(p.id)}" data-expr="${hurt ? 'hurt' : 'neutral'}"></canvas>
        <div>
          <h2>${esc(p.name)}</h2>
          <p class="muted">${esc(p.positionLabel)} · level ${p.level}</p>
          ${starters.has(p.id) ? '<span class="badge">Starting</span>' : ''}
          ${hurt ? `<span class="badge out">Out ${p.injury}</span>` : '<span class="badge fit">Fit</span>'}
        </div>
      </div>
      <div class="stats">${statLine(p)}</div>
      <div class="bar" title="XP ${p.xp}/${BALANCE.xpLevel}"><span style="width:${Math.round((p.xp / BALANCE.xpLevel) * 100)}%"></span></div>
      <p class="muted">XP ${p.xp}/${BALANCE.xpLevel}. Focus ${STAT_LABEL[race.positions.find((pos) => pos.id === p.position)?.focus || 'agility']} on level-up.</p>
      <div class="row">
        <button type="button" data-act="train-open" data-id="${esc(p.id)}">${trainOpen ? 'Close' : 'Train'}</button>
        ${hurt ? `<button type="button" data-act="heal" data-id="${esc(p.id)}" ${canHeal ? '' : 'disabled'} title="${canHeal ? '' : `Need ${healPrice}g`}">Heal ${healPrice}g</button>` : ''}
        <button type="button" class="ghost" data-act="release-open" data-id="${esc(p.id)}" ${canDrop ? '' : 'disabled'} title="${esc(canDrop ? 'Release this player' : dropReason)}">Release</button>
        ${dropReason ? `<span class="why">${esc(dropReason)}</span>` : ''}
      </div>
      ${trainOpen ? `<div class="row">${trains}</div><p class="muted">Training ground level ${team.trainingLevel}: ${esc(trainingGroundBlurb(team.trainingLevel))}</p>` : ''}
      ${releaseOpen ? `<div class="row"><button type="button" class="danger" data-act="release-yes" data-id="${esc(p.id)}">Release ${esc(p.name)}</button></div>` : ''}
    </article>`;
  }).join('');
  const hurtList = team.players.filter((p) => p.injury > 0);
  const hurtLine = hurtList.length
    ? `Injured: ${hurtList.map((p) => `${p.name} (${p.injury})`).join(', ')}.`
    : 'No one is injured.';
  return `<div class="panel" style="border-left:8px solid ${race.colors.primary}"><h2>Squad ${team.players.length}/${BALANCE.rosterMax}</h2>
    <p class="muted">${fit} fit. Training sessions left this week: ${game.trainsLeft ?? 0}/${BALANCE.trainsPerWeek}. ${esc(hurtLine)} Five start. Release stays blocked below ${BALANCE.rosterMin} players or below ${BALANCE.fieldSize} fit. ${esc(race.name)}: ${esc(race.style)}. ${esc(traitLabel(race.trait))}</p></div>
    <div class="grid" style="margin-top:10px">${cards}</div>`;
}

function renderRecruit(team) {
  const full = team.players.length >= BALANCE.rosterMax;
  const cards = game.pool.map((p, i) => {
    const cost = recruitCost(p);
    const afford = team.gold >= cost && !full;
    const why = full ? `Roster is full (${BALANCE.rosterMax})` : `Need ${cost}g`;
    return `<article class="card">
      <div class="who">
        <canvas class="portrait" width="120" height="150" data-portrait="${esc(p.id)}" data-expr="neutral"></canvas>
        <div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.positionLabel)}</p></div>
      </div>
      <div class="stats">${statLine(p)}</div>
      <button type="button" data-act="sign" data-index="${i}" ${afford ? '' : 'disabled'} title="${esc(why)}">Sign for ${cost}g</button>
    </article>`;
  }).join('');
  const rerollAfford = team.gold >= BALANCE.scoutReroll;
  return `<div class="panel"><h2>Scouting pool</h2>
    <p class="muted">Three free looks land between matches. A reroll costs ${BALANCE.scoutReroll}g. Price is ${raceById(team.race).recruitCost}g plus 6g for every stat point over 18.</p>
    <button type="button" class="ghost" data-act="reroll" ${rerollAfford ? '' : 'disabled'} title="${rerollAfford ? '' : `Need ${BALANCE.scoutReroll}g`}">Reroll scouts · ${BALANCE.scoutReroll}g</button>
    </div><div class="grid" style="margin-top:10px">${cards}</div>`;
}

function renderUpgrades(team) {
  const blocks = [
    ['training', 'Training ground', team.trainingLevel, trainingGroundBlurb(team.trainingLevel), images.stands],
    ['stadium', 'Stadium', team.stadiumLevel, stadiumBlurb(team.stadiumLevel), images.trophy],
  ].map(([kind, label, level, blurb, img]) => {
    const cost = facilityCost(kind, level);
    const maxed = cost == null;
    const afford = !maxed && team.gold >= cost;
    const art = img?.ok ? `<img src="${img.img.src}" width="48" height="48" alt="" style="image-rendering:${img.pixelated ? 'pixelated' : 'auto'}">` : '';
    return `<article class="card">
      <div class="who">${art}<h2>${label} · level ${level}/${BALANCE.maxFacility}</h2></div>
      <p class="muted">${esc(blurb)}</p>
      ${maxed ? '<p class="style">Maxed.</p>' : `<button type="button" data-act="upgrade" data-kind="${kind}" ${afford ? '' : 'disabled'} title="${afford ? '' : `Need ${cost}g`}">Upgrade · ${cost}g</button>`}
    </article>`;
  }).join('');
  const win = purse(team, 'win');
  const loss = purse(team, 'loss');
  const rules = rulesLines().map((line) => `<li>${esc(line)}</li>`).join('');
  return `<div class="split">${blocks}</div>
    <div class="panel" style="margin-top:10px">
      <h2>What you get paid</h2>
      <p class="muted">At ${team.fans} fans, stadium ${team.stadiumLevel}: a win pays ${win.total}g (gate ${win.gate} + sponsor ${win.sponsor}) and ${win.fansDelta >= 0 ? '+' : ''}${win.fansDelta} fans. A loss pays ${loss.total}g and ${loss.fansDelta} fans. Fans never drop below ${BALANCE.fansMin}.</p>
      <ul class="muted">${rules}</ul>
    </div>`;
}

function tableHtml(division) {
  const rows = divisionTableRows(division).map((row, index) => {
    const me = row.id === game.playerId ? ' me' : '';
    const spot = index === 0 ? ' spot' : '';
    const color = raceById(row.race).colors.primary;
    return `<tr class="${me}${spot}" style="box-shadow:inset 4px 0 0 ${color}">
      <td>${index + 1}</td>
      <td><span class="swatch" style="background:${color}"></span> ${esc(row.name)}</td>
      <td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td>
      <td>${row.lost}</td><td>${row.pf}</td><td>${row.pa}</td><td>${row.diff}</td><td>${row.pts}</td>
    </tr>`;
  }).join('');
  return `<div class="panel"><h2>${esc(divisionName(division))}</h2>
    <table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>PF</th><th>PA</th><th>Diff</th><th>Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function divisionTableRows(division) {
  return leagueTable(game).filter((row) => row.division === division);
}

function renderTable() {
  return `<p class="muted">You only play your division. First place, after difference, points scored, then name, goes to the cup against the other division's champion.</p>
    <div class="split">${tableHtml('fen')}${tableHtml('ridge')}</div>`;
}

function lineupBlock(team) {
  const starters = pickLineup(team.players);
  const lines = starters.map((p) => `<li>${esc(p.name)} · ${esc(p.positionLabel)} · Str ${p.stats.strength} Spd ${p.stats.speed} Agi ${p.stats.agility} Pas ${p.stats.passing}</li>`).join('');
  const total = starters.reduce((s, p) => s + p.stats.strength + p.stats.speed + p.stats.agility + p.stats.passing, 0);
  return `<h2>${esc(team.name)}</h2><p class="muted">${esc(traitLabel(team.trait))} Starting stat total ${total}. Fit ${healthyCount(team)}/${team.players.length}.</p><ul class="muted">${lines}</ul>`;
}

function renderMatchup(team) {
  const fx = playerFixture(game);
  if (!fx) return `<div class="panel"><p>No match scheduled.</p></div>`;
  const oppId = fx[0] === team.id ? fx[1] : fx[0];
  const opp = teamById(game, oppId);
  const key = JSON.stringify([game.season, game.round, team.players, opp.players]);
  if (ui.estimateKey !== key) {
    let w = 0; let d = 0; let l = 0;
    for (let i = 0; i < 40; i += 1) {
      const res = simById(game, team.id, opp.id, hashSeed(game.seed, 'est', game.season, game.round, i));
      if (res.winner === 'A') w += 1;
      else if (res.winner === 'B') l += 1;
      else d += 1;
    }
    ui.estimate = { w, d, l };
    ui.estimateKey = key;
  }
  const win = purse(team, 'win');
  const loss = purse(team, 'loss');
  const draw = purse(team, 'draw');
  const fit = healthyCount(team);
  const warn = fit === 0
    ? 'Nobody is fit. You forfeit 0–3.'
    : fit < 5
      ? `Only ${fit} fit. You will start short-handed.`
      : '';
  return `<div class="split">
      <div class="panel">${lineupBlock(team)}</div>
      <div class="panel">${lineupBlock(opp)}</div>
    </div>
    <div class="panel" style="margin-top:10px">
      <p>${esc(matchRuleText())}</p>
      <p class="muted">Forty kicks with today's squads (not this match's real seed): ${ui.estimate.w} wins, ${ui.estimate.d} draws, ${ui.estimate.l} losses.</p>
      <p class="muted">Win ${win.total}g and ${win.fansDelta >= 0 ? '+' : ''}${win.fansDelta} fans. Draw ${draw.total}g. Loss ${loss.total}g and ${loss.fansDelta} fans.</p>
      ${warn ? `<p class="style">${esc(warn)}</p>` : ''}
      <button type="button" class="ember" data-act="kickoff">Kick off</button>
    </div>`;
}

function renderMatchShell() {
  return `<div class="match-layout">
    <canvas id="pitch" width="800" height="600" aria-label="Animated fantasy football match"></canvas>
    <div class="row"><button type="button" class="ghost" data-act="finish-match">Skip to result</button><button type="button" class="ember" id="continue" data-act="continue" ${ui.playback?.done ? '' : 'hidden'}>Continue</button></div>
  </div>`;
}

function renderPost() {
  const post = ui.post;
  if (!post) return '<div class="panel">Nothing to report.</div>';
  const mine = post.mine;
  const home = mine.a === game.playerId;
  const us = home ? mine.res.scoreA : mine.res.scoreB;
  const them = home ? mine.res.scoreB : mine.res.scoreA;
  const opp = teamById(game, home ? mine.b : mine.a);
  const result = home ? mine.report.resultA : mine.report.resultB;
  const pay = home ? mine.report.payA : mine.report.payB;
  const fansAfter = home ? mine.report.fansAfterA : mine.report.fansAfterB;
  const fansBefore = home ? mine.report.fansBeforeA : mine.report.fansBeforeB;
  const notes = mine.report.notes.filter((n) => n.teamId === game.playerId).map((n) => `<li>${esc(n.text)}</li>`).join('');
  const headline = result === 'win' ? 'WIN' : result === 'loss' ? 'LOSS' : 'DRAW';
  const next = post.toReview
    ? '<button type="button" class="ember" data-act="to-review">See the table</button>'
    : '<button type="button" class="ember" data-act="to-hub">Back to the clubhouse</button>';
  return `<div class="panel end">
    <p class="muted">${esc(playerTeam(game).short)} ${us} – ${them} ${esc(opp.short)}</p>
    <h2>${headline}</h2>
    <p>Gate ${pay.gate}g + sponsor ${pay.sponsor}g = ${pay.total}g. Fans ${fansBefore} → ${fansAfter}.</p>
    ${notes ? `<ul class="muted" style="text-align:left">${notes}</ul>` : '<p class="muted">No fresh injuries, no level-ups.</p>'}
    ${next}
  </div>`;
}

function renderReview() {
  const place = playerRank(game);
  const mine = divisionTableRows(place.division);
  const otherId = place.division === 'fen' ? 'ridge' : 'fen';
  const other = divisionTableRows(otherId)[0];
  const champ = mine[0];
  const made = place.champion;
  let blurb = `You finished ${place.tied ? 'tied for ' : ''}${ordinal(place.rank)} in the ${divisionName(place.division)}.`;
  if (made) blurb = `You won the ${divisionName(place.division)} on ${place.row.pts} points. Cup final against ${other.name}.`;
  else blurb = `You finished ${place.tied ? 'tied for ' : ''}${ordinal(place.rank)} in the ${divisionName(place.division)}. ${champ.name} take the cup spot.`;
  const action = made
    ? '<button type="button" class="ember" data-act="final">Play the cup final</button>'
    : '<button type="button" class="ember" data-act="next">Next season</button>';
  return `${renderTable()}<div class="panel end" style="margin-top:10px"><h2>${esc(blurb)}</h2>
    <p class="muted">A level cup final goes to the side with more division points, then difference, then points scored. ${made ? '' : 'The offseason clears injuries. Rivals return with +1 to every stat.'}</p>
    ${action}</div>`;
}

function renderDone() {
  const report = game.finalReport;
  const home = teamById(game, report.homeId);
  const away = teamById(game, report.awayId);
  const winner = teamById(game, report.cupWinnerId);
  const title = report.playerWon ? 'CUP CHAMPIONS' : 'RUNNERS-UP';
  const drawNote = report.drawn ? ' Level scores. The league leader keeps the cup.' : '';
  const pay = report.homeId === game.playerId ? report.report.payA : report.report.payB;
  const art = images.trophy?.ok ? `<img src="${images.trophy.img.src}" width="48" height="48" alt="">` : '';
  return `<div class="panel end">
    ${art}<h2>${title}</h2>
    <p>${esc(home.short)} ${report.res.scoreA} – ${report.res.scoreB} ${esc(away.short)}. ${esc(winner.name)} lift the cup.${drawNote}</p>
    <p class="muted">You collected ${pay.total}g. Cups ${game.cups}. Division titles ${game.titles}.</p>
    <p class="muted">Next season the rivals come back sharper (+${game.season} to every stat). Your squad, gold, fans, and buildings stay. Injuries clear.</p>
    <button type="button" class="ember" data-act="next">Start season ${game.season + 1}</button>
  </div>`;
}

function paintStill() {
  document.querySelectorAll('[data-crest]').forEach((canvas) => {
    drawCrest(canvas.getContext('2d'), raceById(canvas.dataset.crest), canvas.width);
  });
  document.querySelectorAll('[data-face]').forEach((canvas) => {
    const race = raceById(canvas.dataset.face);
    if (!race) return;
    drawPortrait(canvas.getContext('2d'), canvas.width, canvas.height, {
      race: race.id,
      position: race.face,
    }, 'neutral');
  });
  document.querySelectorAll('[data-portrait]').forEach((canvas) => {
    const player = findAnyPlayer(canvas.dataset.portrait);
    if (!player) return;
    drawPortrait(canvas.getContext('2d'), canvas.width, canvas.height, player, canvas.dataset.expr || 'neutral');
  });
}

function findAnyPlayer(id) {
  if (!game) return null;
  for (const team of game.teams) {
    const found = team.players.find((p) => p.id === id);
    if (found) return found;
  }
  return (game.pool || []).find((p) => p.id === id) || null;
}

function drawCrest(ctx, race, size) {
  ctx.clearRect(0, 0, size, size);
  const art = images[`crest-${race.file}`];
  if (art?.ok) {
    ctx.imageSmoothingEnabled = !art.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.img, 0, 0, size, size);
    return;
  }
  const s = size / 32;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = race.colors.dark;
  ctx.fillRect(6, 2, 20, 22);
  ctx.fillStyle = race.colors.primary;
  ctx.fillRect(8, 4, 16, 16);
  ctx.fillStyle = race.colors.secondary;
  ctx.fillRect(8, 4, 16, 4);
  ctx.fillStyle = race.colors.ink;
  if (race.emblem === 'tusk') { ctx.fillRect(12, 12, 3, 6); ctx.fillRect(17, 12, 3, 6); }
  else if (race.emblem === 'stripe') ctx.fillRect(14, 8, 4, 12);
  else if (race.emblem === 'anvil') { ctx.fillRect(10, 14, 12, 4); ctx.fillRect(13, 10, 6, 4); }
  else if (race.emblem === 'leaf') { ctx.fillRect(14, 8, 4, 10); ctx.fillRect(12, 10, 8, 4); }
  else if (race.emblem === 'tooth') { ctx.fillRect(11, 12, 3, 5); ctx.fillRect(15, 12, 3, 5); ctx.fillRect(19, 12, 3, 5); }
  else if (race.emblem === 'eyes') { ctx.fillRect(11, 10, 3, 3); ctx.fillRect(18, 10, 3, 3); }
  else if (race.emblem === 'snout') ctx.fillRect(18, 12, 6, 4);
  else { ctx.fillRect(12, 10, 8, 6); }
  ctx.fillStyle = race.colors.primary;
  ctx.fillRect(12, 20, 4, 6);
  ctx.fillRect(16, 20, 4, 6);
  ctx.restore();
}

function faceMarks(ctx, race, expression) {
  const c = race.colors;
  ctx.fillStyle = '#161616';
  if (expression === 'hurt') {
    ctx.fillRect(17, 5, 2, 4);
    ctx.fillRect(16, 6, 4, 2);
  } else if (expression === 'angry') {
    ctx.fillRect(16, 5, 4, 2);
    ctx.fillRect(16, 4, 2, 2);
  } else {
    ctx.fillRect(18, 6, 2, 2);
  }
  ctx.fillStyle = expression === 'happy' ? '#8a3030' : '#3a2418';
  if (expression === 'happy') ctx.fillRect(16, 10, 5, 2);
  else if (expression === 'angry' || expression === 'hurt') ctx.fillRect(16, 11, 5, 1);
  else ctx.fillRect(17, 10, 3, 1);
  if (race.id === 'orcs' || race.id === 'ogres') {
    ctx.fillStyle = '#f4f0dc';
    ctx.fillRect(20, 11, 2, 3);
  } else if (race.id === 'elves' || race.id === 'darkelves') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(8, 6, 3, 2);
  } else if (race.id === 'goblins' || race.id === 'halflings') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(6, 7, 4, 3);
  } else if (race.id === 'undead') {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(18, 6, 2, 2);
  } else if (race.id === 'ratfolk') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(21, 8, 6, 3);
  } else if (race.id === 'lizardfolk') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(21, 7, 7, 4);
  } else if (race.id === 'doomsworn') {
    ctx.fillStyle = c.primary;
    ctx.fillRect(11, 1, 2, 4);
    ctx.fillRect(19, 1, 2, 4);
  }
}

function drawMascot(ctx, race, pose, frame, expression = 'neutral') {
  const c = race.colors;
  const bulky = race.id === 'ogres' || race.id === 'doomsworn';
  if (pose === 'down') {
    ctx.fillStyle = c.primary;
    ctx.fillRect(2, 20, 22, 8);
    ctx.fillStyle = c.secondary;
    ctx.fillRect(4, 18, 6, 4);
    ctx.fillStyle = c.skin;
    ctx.fillRect(22, 16, 8, 8);
    faceMarks(ctx, race, 'hurt');
    return;
  }
  const step = pose === 'run' ? (frame % 2 ? 3 : -2) : 0;
  const lean = pose === 'tackle' ? (frame === 0 ? -3 : 5) : 0;
  ctx.save();
  ctx.translate(lean, 0);
  const short = race.id === 'dwarves' || race.id === 'goblins' || race.id === 'halflings';
  const bodyY = short ? 15 : bulky ? 11 : 12;
  const bodyH = short ? 9 : bulky ? 13 : 11;
  const bodyW = bulky ? 18 : 16;
  const bodyX = bulky ? 7 : 8;
  ctx.fillStyle = c.dark;
  ctx.fillRect(10, 22, 4, short ? 6 : 8);
  ctx.fillRect(18 + step, 22, 4, short ? 6 : 8);
  ctx.fillStyle = c.primary;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  ctx.fillStyle = c.secondary;
  ctx.fillRect(bodyX - 1, bodyY + 1, 4, 4);
  ctx.fillRect(bodyX + bodyW - 3, bodyY + 1, 4, 4);
  if (pose === 'tackle') {
    ctx.fillStyle = c.skin;
    ctx.fillRect(frame === 0 ? 2 : 22, bodyY + 2, 8, 3);
  }
  ctx.fillStyle = c.skin;
  ctx.fillRect(10, 2, 12, 11);
  if (race.id === 'humans' || race.id === 'dwarves' || race.id === 'halflings') {
    ctx.fillStyle = race.id === 'dwarves' ? c.secondary : c.dark;
    ctx.fillRect(10, 2, 12, 3);
  }
  if (race.id === 'dwarves') {
    ctx.fillStyle = c.secondary;
    ctx.fillRect(10, 11, 12, 4);
  }
  if (race.id === 'ratfolk') {
    ctx.fillStyle = c.secondary;
    ctx.fillRect(2, 16, 7, 2);
  }
  if (race.id === 'lizardfolk') {
    ctx.fillStyle = c.primary;
    ctx.fillRect(2, 16, 7, 3);
  }
  faceMarks(ctx, race, expression);
  ctx.restore();
}

function drawPortrait(ctx, w, h, player, expression) {
  const race = raceById(player.race);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a120e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = race.colors.primary;
  ctx.fillRect(0, h - 10, w, 10);
  ctx.fillStyle = race.colors.secondary;
  ctx.fillRect(0, h - 14, w, 4);
  const rec = portraitRecord(race, player.position, expression);
  if (rec?.ok) {
    const fr = frameOf(rec, 0);
    const pad = 8;
    const maxW = w - pad * 2;
    const maxH = h - 22;
    const scale = Math.min(maxW / fr.sw, maxH / fr.sh);
    const dw = fr.sw * scale;
    const dh = fr.sh * scale;
    ctx.imageSmoothingEnabled = !rec.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(rec.img, fr.sx, fr.sy, fr.sw, fr.sh, (w - dw) / 2, h - 14 - dh, dw, dh);
    return;
  }
  ctx.save();
  ctx.translate(w / 2, h - 16);
  ctx.scale(Math.min(w, h) / 40, Math.min(w, h) / 40);
  ctx.translate(-16, -32);
  drawMascot(ctx, race, 'idle', 0, expression);
  ctx.restore();
}

function drawPlayer(ctx, player, x, y, facing, pose, frame) {
  const race = raceById(player.race);
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px, py, PLAYER_H * 0.22, PLAYER_H * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = race.colors.primary;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(px, py - 1, PLAYER_H * 0.16, PLAYER_H * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const art = poseArt(race, player.position, pose);
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  if (pose === 'down') {
    ctx.fillStyle = 'rgba(210, 184, 140, 0.55)';
    ctx.beginPath();
    ctx.ellipse(8, -3, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 244, 220, 0.35)';
    ctx.beginPath();
    ctx.ellipse(28, -8, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (art.rec?.ok) {
    if (art.fake && pose === 'run') {
      const up = frame % 2 === 1;
      ctx.translate(0, up ? -6 : 0);
      ctx.scale(up ? 0.96 : 1.05, up ? 1.06 : 0.94);
    } else if (art.fake && pose === 'tackle') {
      const wind = frame === 0;
      ctx.rotate(wind ? -0.22 : 0.3);
      ctx.translate(wind ? -10 : 18, wind ? -4 : 2);
    } else if (art.fake && pose === 'down') {
      ctx.translate(6, 10);
      ctx.rotate(Math.PI / 2);
    }
    const fr = frameOf(art.rec, art.fake ? 0 : frame);
    const dh = PLAYER_H;
    const dw = dh * (fr.sw / fr.sh);
    ctx.imageSmoothingEnabled = !art.rec.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.rec.img, fr.sx, fr.sy, fr.sw, fr.sh, -dw / 2, -dh, dw, dh);
  } else {
    const s = PLAYER_H / 32;
    ctx.scale(s, s);
    ctx.translate(-16, -32);
    drawMascot(ctx, race, pose, frame, pose === 'down' ? 'hurt' : pose === 'tackle' ? 'angry' : 'neutral');
  }
  ctx.restore();
}

function drawBall(ctx, x, y) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (images.ball?.ok) {
    ctx.imageSmoothingEnabled = !images.ball.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(images.ball.img, -16, -16, 32, 32);
  } else {
    ctx.fillStyle = '#6b3a1f';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = '#f4e6cf';
    ctx.fillRect(-2, -6, 4, 12);
    ctx.fillRect(-6, -2, 12, 4);
  }
  ctx.restore();
}

function drawPitch(ctx, homeRace, awayRace, fans, stadiumLevel) {
  if (images.pitch?.ok) {
    ctx.imageSmoothingEnabled = !images.pitch.pixelated;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(images.pitch.img, 0, 0, 800, 600);
    return;
  }
  ctx.fillStyle = '#8ec6ea';
  ctx.fillRect(0, 0, 800, 210);
  ctx.fillStyle = '#d7ecf8';
  ctx.fillRect(80, 36, 70, 24);
  ctx.fillRect(420, 28, 90, 20);
  ctx.fillStyle = '#6b4a32';
  ctx.fillRect(24, 96, 752, 78);
  ctx.fillStyle = '#4e3424';
  ctx.fillRect(24, 168, 752, 16);
  if (stadiumLevel >= 2) {
    ctx.fillStyle = '#5a3b28';
    ctx.fillRect(24, 70, 752, 28);
  }
  const seats = Math.min(96, Math.floor(fans / 2));
  for (let i = 0; i < 96; i += 1) {
    const col = i % 32;
    const row = Math.floor(i / 32);
    const color = i < seats
      ? (i % 3 === 0 ? homeRace.colors.primary : i % 3 === 1 ? awayRace.colors.primary : '#f0c14a')
      : '#3a2a22';
    ctx.fillStyle = color;
    ctx.fillRect(40 + col * 23, 108 + row * 18, 8, 8);
  }
  ctx.fillStyle = '#2f8a3a';
  ctx.fillRect(36, 210, 728, 250);
  ctx.fillStyle = '#277a32';
  for (let x = 36; x < 764; x += 56) ctx.fillRect(x, 210, 28, 250);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = homeRace.colors.primary;
  ctx.fillRect(36, 210, 72, 250);
  ctx.fillStyle = awayRace.colors.primary;
  ctx.fillRect(692, 210, 72, 250);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  for (let s = 0; s <= 10; s += 1) {
    const x = 36 + (s / 10) * 728;
    ctx.beginPath();
    ctx.moveTo(x, 214);
    ctx.lineTo(x, 456);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(48, 250, 4, 70);
  ctx.fillRect(48, 250, 18, 4);
  ctx.fillRect(748, 250, 4, 70);
  ctx.fillRect(730, 250, 18, 4);
  ctx.fillStyle = '#6b4a32';
  ctx.fillRect(0, 460, 800, 48);
}

function startPlayback(res, meta) {
  const roster = {};
  for (const [id, side] of [[meta.a, 'A'], [meta.b, 'B']]) {
    for (const player of teamById(game, id).players) roster[player.id] = { player, side };
  }
  ui.playback = { res, meta, roster, t: 0, done: false };
  ui.screen = 'match';
  ui.paused = false;
  render();
  lastTick = performance.now();
  stopLoop();
  const loop = (now) => {
    if (ui.screen !== 'match' || !ui.playback) return;
    const raw = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;
    if (!ui.paused && !ui.playback.done) {
      ui.playback.t += raw * ui.speed;
      if (ui.playback.t >= ui.playback.res.duration) {
        ui.playback.t = ui.playback.res.duration;
        ui.playback.done = true;
        const btn = document.getElementById('continue');
        if (btn) btn.hidden = false;
      }
    }
    const canvas = document.getElementById('pitch');
    if (canvas) drawMatch(canvas.getContext('2d'));
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function drawMatch(ctx) {
  const pb = ui.playback;
  const res = pb.res;
  ctx.imageSmoothingEnabled = false;
  const home = teamById(game, pb.meta.a);
  const away = teamById(game, pb.meta.b);
  const ev = res.events.reduce((m, e) => (e.t <= pb.t ? e : m), res.events[0]);
  const u = ev.dt > 0 ? Math.min(1, Math.max(0, (pb.t - ev.t) / ev.dt)) : 1;
  const spot = ev.fromSpot + (ev.spot - ev.fromSpot) * u;
  drawPitch(ctx, raceById(home.race), raceById(away.race), home.fans + away.fans, Math.max(home.stadiumLevel, away.stadiumLevel));

  const los = 48 + (spot / 100) * 704;
  const slots = [
    { dx: 78, dy: 6 },
    { dx: 130, dy: -34 },
    { dx: 132, dy: 38 },
    { dx: 188, dy: -12 },
    { dx: 196, dy: 24 },
  ];
  const actors = [];
  const seen = new Set();
  const addId = (id) => {
    if (!id || seen.has(id) || !pb.roster[id]) return;
    seen.add(id);
    actors.push(id);
  };
  for (const id of ev.fieldA || []) addId(id);
  for (const id of ev.fieldB || []) addId(id);
  for (const id of ev.down || []) addId(id);

  const placed = actors.map((id) => {
    const info = pb.roster[id];
    const side = info.side;
    const index = side === 'A' ? (ev.fieldA || []).indexOf(id) : (ev.fieldB || []).indexOf(id);
    const slot = slots[Math.max(0, index) % slots.length];
    const dir = side === 'A' ? -1 : 1;
    const slotIndex = Math.max(0, index) % slots.length;
    const rawX = los + dir * slot.dx;
    // Keep centres 40px inside the painted field (x 36-764); fan out anyone pinned at a wall.
    let x = rawX;
    if (rawX > 724) x = 724 - slotIndex * 30;
    else if (rawX < 76) x = 76 + slotIndex * 30;
    // Spread feet across the painted grass (field y 210-460) instead of the bottom third.
    const y = 378 + slot.dy * 2;
    if (ev.carrierId === id) x += side === 'A' ? 16 : -16;
    let pose = 'idle';
    let frame = Math.floor(pb.t * 2) % 2;
    const knocked = (ev.down || []).includes(id) || (ev.type === 'casualty' && ev.targetId === id);
    if (knocked) { pose = 'down'; frame = 0; }
    else if (ev.type === 'tackle' && ev.actorId === id) {
      pose = 'tackle';
      frame = u < 0.45 ? 0 : 1;
      x += frame === 0 ? dir * 8 : -dir * 12;
    } else if (ev.carrierId === id && (ev.type === 'run' || ev.type === 'touchdown' || ev.type === 'pass')) {
      pose = 'run';
      frame = Math.floor(pb.t * 8) % 2;
    }
    return { id, info, x, y, pose, frame, facing: side === 'A' ? 1 : -1 };
  }).sort((a, b) => a.y - b.y);

  for (const actor of placed) drawPlayer(ctx, actor.info.player, actor.x, actor.y, actor.facing, actor.pose, actor.frame);

  const carrier = placed.find((a) => a.id === ev.carrierId);
  const ballX = carrier ? carrier.x + carrier.facing * 18 : los;
  const ballY = carrier ? carrier.y - 40 : 372;
  drawBall(ctx, ballX, ballY + Math.sin(pb.t * 10) * 2);
  if (carrier) {
    ctx.fillStyle = '#140e0c';
    ctx.font = '12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(carrier.info.player.name, Math.round(carrier.x) + 1, Math.round(carrier.y) - PLAYER_H - 8);
    ctx.fillStyle = '#fff8e8';
    ctx.fillText(carrier.info.player.name, Math.round(carrier.x), Math.round(carrier.y) - PLAYER_H - 9);
  }

  ctx.fillStyle = 'rgba(12,8,6,0.88)';
  ctx.fillRect(16, 10, 768, 42);
  ctx.font = '16px Courier New';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff8e8';
  ctx.fillText(home.short, 28, 36);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff8e8';
  ctx.fillText(away.short, 772, 36);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff8e8';
  ctx.font = 'bold 22px Courier New';
  ctx.fillText(`${ev.scoreA}  –  ${ev.scoreB}`, 400, 38);
  ctx.font = '14px Courier New';
  ctx.fillText(ev.clock || '', 560, 36);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0c14a';
  ctx.fillText(pb.meta.label, 200, 24);

  ctx.fillStyle = '#140e0c';
  ctx.fillRect(0, 508, 800, 92);
  ctx.fillStyle = '#f4e6cf';
  ctx.font = '18px Courier New';
  const prev = res.events[res.events.indexOf(ev) - 1];
  if (prev) {
    ctx.fillStyle = '#8d7b66';
    ctx.fillText(prev.text.slice(0, 72), 16, 540);
  }
  ctx.fillStyle = '#f4e6cf';
  ctx.fillText((ev.text || '').slice(0, 72), 16, 570);

  if (u < 0.92) {
    if (ev.popup === 'TOUCHDOWN!' && ev.actorId && pb.roster[ev.actorId]) {
      ctx.save();
      ctx.translate(24, 150);
      drawPortrait(ctx, 150, 180, pb.roster[ev.actorId].player, 'happy');
      ctx.restore();
    } else if (ev.type === 'tackle' && ev.actorId && pb.roster[ev.actorId]) {
      ctx.save();
      ctx.translate(626, 168);
      drawPortrait(ctx, 140, 168, pb.roster[ev.actorId].player, 'angry');
      ctx.restore();
    } else if (ev.popup === 'CASUALTY!') {
      if (ev.targetId && pb.roster[ev.targetId]) {
        ctx.save();
        ctx.translate(24, 150);
        drawPortrait(ctx, 140, 170, pb.roster[ev.targetId].player, 'hurt');
        ctx.restore();
      }
      if (ev.actorId && ev.actorId !== ev.targetId && pb.roster[ev.actorId]) {
        ctx.save();
        ctx.translate(636, 168);
        drawPortrait(ctx, 130, 156, pb.roster[ev.actorId].player, 'angry');
        ctx.restore();
      }
    }
  }

  if (ev.popup && u < 0.9) {
    const color = ev.popup === 'CASUALTY!' ? '#ff5a4a' : ev.popup === 'FUMBLE!' ? '#ffb020' : '#ffe566';
    ctx.font = 'bold 48px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#140e0c';
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) ctx.fillText(ev.popup, 400 + dx, 250 + dy);
    ctx.fillStyle = color;
    ctx.fillText(ev.popup, 400, 250);
    ctx.textAlign = 'left';
  }

  if (ui.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(250, 280, 300, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', 400, 322);
    ctx.textAlign = 'left';
  }
}

function onContinue() {
  if (ui.applying || !ui.playback || !ui.playback.done) return;
  ui.applying = true;
  stopLoop();
  const pending = ui.playback.meta.kind;
  if (pending === 'final') {
    resolveFinal(game);
    ui.playback = null;
    ui.screen = 'done';
  } else {
    const reports = resolveRound(game);
    const mine = reports.find((r) => r.a === game.playerId || r.b === game.playerId);
    ui.post = { mine, toReview: game.phase === 'review' };
    ui.playback = null;
    ui.screen = 'post';
  }
  ui.estimateKey = '';
  ui.applying = false;
  flash('');
  render();
}

function act(name, el) {
  if (name === 'pick') {
    ui.selectedRace = el.dataset.race;
    render();
    return;
  }
  if (name === 'lead') {
    const seed = (Math.random() * 0x7fffffff) | 0;
    game = newGame(ui.selectedRace, seed);
    ui.screen = 'hub';
    ui.tab = 'club';
    flash(`${playerTeam(game).name} open the season with ${BALANCE.startGold}g and ${BALANCE.startFans} fans.`);
    render();
    return;
  }
  if (!game) return;
  if (name === 'claim') {
    const result = claimGoal(game, el.dataset.goal);
    flash(result.ok ? `${result.name}: +${result.reward}g for the club.` : result.reason);
    render();
    return;
  }
  if (name === 'finish-match' && ui.playback) {
    ui.playback.done = true;
    onContinue();
    return;
  }
  if (name === 'tab') {
    ui.tab = el.dataset.tab;
    ui.trainId = null;
    ui.releaseId = null;
    render();
    return;
  }
  if (name === 'train-open') {
    ui.trainId = ui.trainId === el.dataset.id ? null : el.dataset.id;
    ui.releaseId = null;
    render();
    return;
  }
  if (name === 'train') {
    const result = train(game, el.dataset.id, el.dataset.stat);
    flash(result.ok
      ? `${STAT_LABEL[el.dataset.stat]} +${result.gain} for ${result.cost}g. ${(result.notes || []).join(' ')}`
      : result.reason);
    render();
    return;
  }
  if (name === 'heal') {
    const result = heal(game, el.dataset.id);
    flash(result.ok ? `Healed for ${result.cost}g.` : result.reason);
    render();
    return;
  }
  if (name === 'release-open') {
    ui.releaseId = ui.releaseId === el.dataset.id ? null : el.dataset.id;
    render();
    return;
  }
  if (name === 'release-yes') {
    const result = release(game, el.dataset.id);
    ui.releaseId = null;
    flash(result.ok ? `Released ${result.name}.` : result.reason);
    render();
    return;
  }
  if (name === 'sign') {
    const result = sign(game, Number(el.dataset.index));
    flash(result.ok ? `Signed ${result.name} for ${result.cost}g.` : result.reason);
    render();
    return;
  }
  if (name === 'reroll') {
    const result = rerollPool(game);
    flash(result.ok ? `New scouts. -${result.cost}g.` : result.reason);
    render();
    return;
  }
  if (name === 'upgrade') {
    const result = upgrade(game, el.dataset.kind);
    flash(result.ok ? `${el.dataset.kind === 'training' ? 'Training ground' : 'Stadium'} is level ${result.level}.` : result.reason);
    render();
    return;
  }
  if (name === 'kickoff') {
    const fx = playerFixture(game);
    const seed = fixtureSeed(game, game.round, fx[0], fx[1]);
    const res = simById(game, fx[0], fx[1], seed);
    startPlayback(res, {
      a: fx[0],
      b: fx[1],
      kind: 'league',
      label: `Match ${game.round + 1} / ${game.schedule.length}`,
    });
    return;
  }
  if (name === 'continue') onContinue();
  if (name === 'to-hub') {
    ui.screen = 'hub';
    ui.tab = 'club';
    render();
  }
  if (name === 'to-review') {
    ui.screen = 'review';
    render();
  }
  if (name === 'final') {
    const { home, away } = finalPair(game);
    if (home.id !== game.playerId && away.id !== game.playerId) return;
    const seed = fixtureSeed(game, 'final', home.id, away.id, 'cup');
    const res = simById(game, home.id, away.id, seed);
    startPlayback(res, { a: home.id, b: away.id, kind: 'final', label: 'Cup final' });
  }
  if (name === 'next') {
    nextSeason(game);
    ui.screen = 'hub';
    ui.tab = 'club';
    flash(`Season ${game.season}. Rivals are +${game.season - 1} to every stat. Your injuries cleared.`);
    render();
  }
}

document.body.addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (!el || el.disabled) return;
  act(el.dataset.act, el);
});

document.getElementById('speed').addEventListener('click', () => {
  ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 4 : 1;
  render();
});

document.getElementById('pause').addEventListener('click', () => {
  ui.paused = !ui.paused;
  render();
});

document.getElementById('restart').addEventListener('click', () => {
  document.getElementById('modal').hidden = false;
  document.getElementById('modal-no').focus();
});
document.getElementById('modal-no').addEventListener('click', () => {
  document.getElementById('modal').hidden = true;
  document.getElementById('restart').focus();
});
document.getElementById('modal-yes').addEventListener('click', () => {
  document.getElementById('modal').hidden = true;
  doRestart();
});
document.getElementById('modal').addEventListener('click', (event) => {
  if (event.target.id === 'modal') event.currentTarget.hidden = true;
});

document.getElementById('missing-btn').addEventListener('click', () => {
  showMissing = !showMissing;
  paintMissing();
});
document.addEventListener('keydown', (event) => {
  if (!document.getElementById('modal').hidden) {
    if (event.key === 'Escape') {
      document.getElementById('modal').hidden = true;
      document.getElementById('restart').focus();
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      document.getElementById(document.activeElement.id === 'modal-no' ? 'modal-yes' : 'modal-no').focus();
    }
    return;
  }
  if (event.key !== 'm' && event.key !== 'M') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  showMissing = !showMissing;
  paintMissing();
});

document.getElementById('pitch')?.addEventListener('contextmenu', (event) => event.preventDefault());
document.body.addEventListener('contextmenu', (event) => {
  if (event.target.closest('#pitch, .card, button')) event.preventDefault();
});

window.simulateMatch = simulateMatch;
window.__league = {
  get ui() { return ui; },
  get game() { return game; },
  simulateMatch,
};

const career = loadCareer(storage);
if (career.game) {
  game = career.game;
  ui.screen = game.phase === 'league' ? 'hub' : game.phase;
  ui.tab = 'club';
}
loadArt();
flash(career.message || (game ? `Welcome back to ${playerTeam(game).name}.` : ''));
render();
