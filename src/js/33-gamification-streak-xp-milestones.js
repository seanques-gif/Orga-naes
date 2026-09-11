  // SUBSECTION: Gamification (Streak, XP, Milestones)
  let _streak = { count: 0, lastDate: '' };
  let _xp = 0;
  let _totalCompletions = 0;
  let _streakFreezes = 2;
  let _freezeWeek = '';
  const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
  const STREAK_KEY = 'project-flow-streak';
  const XP_KEY = 'project-flow-xp';
  const MILESTONES_KEY = 'project-flow-milestones';
  const STREAK_FREEZES_KEY = 'project-flow-streak-freezes';
  function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); dt.setDate(diff); return localDateStr(dt); }
  // Was raw localStorage-only, so a completed streak/XP/milestone total
  // could silently fail to persist (and fail to restore) anywhere
  // localStorage isn't available. safeGet/safeSet fall back to IndexedDB
  // the same way every other piece of app state already does.
  (async function loadGamification() {
    try { const s = await safeGet(STREAK_KEY, false); if (s && s.value) _streak = JSON.parse(s.value); } catch(e) {}
    try { const x = await safeGet(XP_KEY, false); if (x && x.value) _xp = parseInt(x.value, 10) || 0; } catch(e) {}
    try { const m = await safeGet(MILESTONES_KEY, false); if (m && m.value) _totalCompletions = parseInt(m.value, 10) || 0; } catch(e) {}
    try { const f = await safeGet(STREAK_FREEZES_KEY, false); if (f && f.value) { const parsed = JSON.parse(f.value); _streakFreezes = parsed.count; _freezeWeek = parsed.week; } } catch(e) {}
    const thisWeek = getMonday(new Date());
    if (_freezeWeek !== thisWeek) { _streakFreezes = 2; _freezeWeek = thisWeek; saveGamification(); }
  })();
  function saveGamification() {
    safeSet(STREAK_KEY, JSON.stringify(_streak), false);
    safeSet(XP_KEY, String(_xp), false);
    safeSet(MILESTONES_KEY, String(_totalCompletions), false);
    safeSet(STREAK_FREEZES_KEY, JSON.stringify({ count: _streakFreezes, week: _freezeWeek }), false);
  }
  function onTaskCompleted(isProject) {
    const today = todayLocalStr();
    if (_streak.lastDate === today) { /* already counted */ }
    else if (_streak.lastDate === daysAgoLocalStr(1)) { _streak.count++; _streak.lastDate = today; }
    else {
      const twoDaysAgo = daysAgoLocalStr(2);
      if (_streak.lastDate === twoDaysAgo && _streakFreezes > 0 && _streak.count > 0) {
        _streakFreezes--;
        _streak.count++;
        _streak.lastDate = today;
        showToast('❄️ Streak freeze used! ' + _streakFreezes + ' remaining');
      } else {
        _streak.count = 1; _streak.lastDate = today;
      }
    }
    const xpGain = isProject ? 25 : 10;
    const oldLvl = Math.floor(_xp / 100) + 1;
    _xp += xpGain;
    const newLvl = Math.floor(_xp / 100) + 1;
    if (newLvl > oldLvl) showToast('⭐ Level up! You\'re now Level ' + newLvl + '!');
    _totalCompletions++;
    if (MILESTONES.includes(_totalCompletions)) { setTimeout(() => showToast('🏆 ' + _totalCompletions + ' tasks completed! Amazing work!'), 800); confetti(); }
    saveGamification(); renderStats();
  }

