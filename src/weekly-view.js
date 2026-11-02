import { BALANCE, STATS, STAT_LABEL, raceById, trainingGroundBlurb, clinicBlurb, stadiumBlurb } from './data.js';
import { ACTIVITY_NAMES, ACTIVITIES, activityEffect, capacities, previewWeek, readyForMatch } from './weekly.js';

export function weekSteps(state) {
  const ready = readyForMatch(state);
  return `<ol class="week-steps" aria-label="Weekly progress"><li class="${ready ? 'step-done' : 'step-active'}"><span>${ready ? '✓' : '1'}</span> Plan the week</li><li class="${ready ? 'step-done' : ''}"><span>${ready ? '✓' : '2'}</span> Grow your club</li><li class="${ready ? 'step-active' : ''}"><span>3</span> Match day</li></ol>`;
}

export function renderWeekReport(report, esc) {
  const rows = report.entries.map(e => `<li><div><strong>${esc(e.name)}</strong><small>${esc(ACTIVITY_NAMES[e.activity])}${e.cost ? ` · ${e.cost}g` : ''}</small></div><span class="report-gains">${e.gains.length ? e.gains.map(g => `<span>${esc(g)}</span>`).join('') : '<small>Rested this week</small>'}</span></li>`).join('');
  return `<div class="week-report"><div class="section-heading"><div><p class="eyebrow">Season ${report.season} · Week ${report.week}</p><h2>A week of progress</h2></div><span>${report.cost}g spent · +${report.fansGained} fans</span></div><ul class="report-list">${rows}</ul></div>`;
}

export function renderWeekly(state, esc) {
  const team = state.teams.find(t => t.id === state.playerId);
  const race = raceById(team.race);
  if (readyForMatch(state)) {
    return `${weekSteps(state)}<section class="panel week-complete"><p class="eyebrow">The work is done. Time to play.</p><h2>Your squad is ready for match day.</h2><p class="muted">This week's activities are complete. Your gains are saved, and your next preparation week opens after the match.</p><button class="ember" data-act="tab" data-tab="match">Go to match day →</button></section><section class="panel report-panel">${renderWeekReport(state.week.report, esc)}</section>`;
  }
  const preview = previewWeek(state);
  const cap = capacities(team);
  const cards = [
    ['training', 'Training ground', team.trainingLevel, trainingGroundBlurb(team.trainingLevel)],
    ['recovery', 'Club clinic', team.clinicLevel, clinicBlurb(team.clinicLevel, team.trait)],
    ['outreach', 'Stadium & fans', team.stadiumLevel, stadiumBlurb(team.stadiumLevel)],
  ].map(([kind, label, level, text]) => `<article class="facility-mini"><div class="facility-top"><span class="facility-symbol ${kind}" aria-hidden="true">${kind === 'training' ? '↗' : kind === 'recovery' ? '+' : '⚑'}</span><div><h3>${label}</h3><small>Level ${level} / 3</small></div></div><p>${esc(text)}</p><div class="capacity ${preview.used[kind] > preview.limits[kind] ? 'over' : ''}"><strong>${preview.used[kind]} / ${preview.limits[kind]}</strong> places assigned</div></article>`).join('');
  const rows = preview.rows.map(({ player: p, activity, cost, text }) => {
    const options = ACTIVITIES.map(id => {
      const disabled = p.injury > 0 ? !['rest', 'recovery'].includes(id) : id === 'recovery' || (STATS.includes(id) && p.stats[id] >= BALANCE.statCap);
      const price = activityEffect(team, p, id).cost;
      return `<option value="${id}" ${id === activity ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(ACTIVITY_NAMES[id])}${price ? ` · ${price}g` : ' · free'}</option>`;
    }).join('');
    return `<article class="assignment-row"><div class="assignment-player"><img src="assets/${race.file}-${p.position}-portrait-neutral.png" width="56" height="56" alt=""><div><h3>${esc(p.name)}</h3><p>${esc(p.positionLabel)} · Lv ${p.level} · ${p.xp}/${BALANCE.xpLevel} XP</p><p class="weekly-stats">${STATS.map(stat => `${STAT_LABEL[stat]} ${p.stats[stat]}`).join(' � ')}</p>${p.injury > 0 ? `<span class="injury-note">Injured: ${p.injury} matches out</span>` : ''}</div></div><div class="assignment-choice"><label for="activity-${esc(p.id)}">Weekly activity</label><select id="activity-${esc(p.id)}" data-activity-player="${esc(p.id)}" aria-label="Activity for ${esc(p.name)}">${options}</select><p>${esc(text)}</p></div><strong class="assignment-cost">${cost ? `${cost}g` : 'Free'}</strong></article>`;
  }).join('');
  return `${weekSteps(state)}<div class="section-heading"><div><p class="eyebrow">Season ${state.season} · Week ${state.round + 1}</p><h2>Every player. A little better.</h2><p class="muted">Give each player one activity. You pay only when you run the week.</p></div><button class="ghost" data-act="tab" data-tab="upgrades">Improve facilities</button></div><div class="facility-grid">${cards}</div><div class="weekly-layout"><section class="assignment-list" aria-label="Player assignments">${rows}</section><aside class="panel week-budget"><p class="eyebrow">This week's plan</p><h2>Make the time count.</h2><dl><div><dt>Treasury</dt><dd>${team.gold}g</dd></div><div><dt>Activity costs</dt><dd>${preview.cost}g</dd></div><div class="budget-total"><dt>After this week</dt><dd>${preview.remaining}g</dd></div></dl>${preview.errors.length ? `<ul class="plan-errors" role="alert">${preview.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="plan-valid">Your plan is ready.</p>'}<button class="ember" data-act="advance-week" ${preview.ok ? '' : 'disabled'}>Run this week · ${preview.cost}g</button><button class="ghost" data-act="reset-plan">Reset to free practice</button><p class="muted">Fit players in team practice earn 2 XP for free. Injured players rest unless assigned treatment. Coached training shares ${cap.training} weekly places.</p></aside></div>`;
}
