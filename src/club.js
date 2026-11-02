import { playerTeam } from './season.js';

export function clubGoals(state) {
  const team = playerTeam(state);
  const history = state.history || [];
  const goals = [
    { id: 'debut', name: 'First whistle', detail: 'Complete your first league match.', value: history.length, target: 1, reward: 30 },
    { id: 'training', name: 'Room to grow', detail: 'Build a level 1 training ground.', value: team.trainingLevel, target: 1, reward: 40 },
    { id: 'win', name: 'Give them a reason to cheer', detail: 'Win your first league match.', value: history.filter(m => m.us > m.them).length, target: 1, reward: 40 },
    { id: 'fans', name: 'A following of your own', detail: 'Reach 60 fans.', value: team.fans, target: 60, reward: 50 },
    { id: 'stadium', name: 'Make it a home', detail: 'Upgrade your stadium to level 1.', value: team.stadiumLevel, target: 1, reward: 40 },
    { id: 'title', name: 'From hopefuls to champions', detail: 'Win a division title.', value: state.titles, target: 1, reward: 100 },
  ];
  return goals.map(g => ({ ...g, complete: g.value >= g.target, claimed: (state.claimedGoals || []).includes(g.id) }));
}

export function claimGoal(state, id) {
  const goal = clubGoals(state).find(g => g.id === id);
  if (!goal || !goal.complete || goal.claimed) return { ok: false, reason: 'This goal is not ready to claim.' };
  (state.claimedGoals ||= []).push(id);
  playerTeam(state).gold += goal.reward;
  return { ok: true, reward: goal.reward, name: goal.name };
}
