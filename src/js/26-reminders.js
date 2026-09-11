    // SUBSECTION: Reminders
  function saveReminders() { safeSet(REMINDERS_KEY, JSON.stringify(reminders), false); }
  function promptReminder(sourceId, title, sourceType) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:var(--z-toast);padding:16px;border-radius:6px;border:1px solid var(--card-border);background:var(--card);color:var(--text);box-shadow:0 12px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:10px;min-width:260px;';
    const now = new Date(); now.setMinutes(now.getMinutes() + 30);
    let rYear = now.getFullYear(), rMonth = now.getMonth() + 1, rDay = now.getDate(), rHour = now.getHours(), rMin = now.getMinutes(), rAmpm = now.getHours() >= 12 ? 'PM' : 'AM';
    rHour = rHour % 12 || 12;
    function padZ(n) { return String(n).padStart(2, '0'); }
    function renderRemindDialog() {
      wrap.innerHTML = '<div style="font-size: calc(var(--font-size-base) - 1px);font-weight:600;">⏰ Set Reminder</div>' +
        '<div style="font-size: calc(var(--font-size-base) - 3px);color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(title) + '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;justify-content:center;">' +
          '<div class="pf-remind-scroll" data-field="year" style="text-align:center;"><div class="pf-remind-val" style="font-size: calc(var(--font-size-base) + 2px);font-weight:600;color:var(--text);padding:6px 8px;">' + rYear + '</div><div style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);">Year</div></div>' +
          '<span style="font-size: calc(var(--font-size-base) + 2px);color:var(--text-dim);">-</span>' +
          '<div class="pf-remind-scroll" data-field="month" style="text-align:center;"><div class="pf-remind-val" style="font-size: calc(var(--font-size-base) + 2px);font-weight:600;color:var(--text);padding:6px 8px;">' + padZ(rMonth) + '</div><div style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);">Month</div></div>' +
          '<span style="font-size: calc(var(--font-size-base) + 2px);color:var(--text-dim);">-</span>' +
          '<div class="pf-remind-scroll" data-field="day" style="text-align:center;"><div class="pf-remind-val" style="font-size: calc(var(--font-size-base) + 2px);font-weight:600;color:var(--text);padding:6px 8px;">' + padZ(rDay) + '</div><div style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);">Day</div></div>' +
          '<span style="font-size: calc(var(--font-size-base) + 2px);color:var(--text-dim);margin:0 6px;">|</span>' +
          '<div class="pf-remind-scroll" data-field="hour" style="text-align:center;"><div class="pf-remind-val" style="font-size: calc(var(--font-size-base) + 2px);font-weight:600;color:var(--text);padding:6px 8px;">' + rHour + '</div><div style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);">Hour</div></div>' +
          '<span style="font-size: calc(var(--font-size-base) + 2px);color:var(--text-dim);">:</span>' +
          '<div class="pf-remind-scroll" data-field="min" style="text-align:center;"><div class="pf-remind-val" style="font-size: calc(var(--font-size-base) + 2px);font-weight:600;color:var(--text);padding:6px 8px;">' + padZ(rMin) + '</div><div style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);">Min</div></div>' +
          '<div class="pf-remind-scroll" data-field="ampm" style="text-align:center;"><div class="pf-remind-val" style="font-size:var(--font-size-base);font-weight:600;color:var(--accent);padding:6px 6px;">' + rAmpm + '</div><div style="font-size: calc(var(--font-size-base) - 5px);color:var(--text-dim);">AM/PM</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;"><button id="pf-remind-ok" class="pf-undo-btn" style="flex:1;padding:6px;">Set</button><button id="pf-remind-cancel" class="pf-undo-btn" style="flex:1;padding:6px;">Cancel</button></div>';
      wrap.querySelectorAll('.pf-remind-scroll').forEach(el => {
        el.style.cursor = 'ns-resize';
        el.style.userSelect = 'none';
        el.style.borderRadius = '6px';
        el.style.padding = '2px 4px';
        el.style.transition = 'background 0.12s';
        el.addEventListener('mouseenter', () => { el.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; });
        el.addEventListener('mouseleave', () => { el.style.background = ''; });
        el.addEventListener('wheel', (ev) => { ev.preventDefault(); const dir = ev.deltaY < 0 ? 1 : -1; adjustField(el.dataset.field, dir); });
        el.addEventListener('dblclick', () => {
          const valEl = el.querySelector('.pf-remind-val');
          const field = el.dataset.field;
          const input = document.createElement('input'); input.type = 'number'; input.value = field === 'year' ? rYear : field === 'month' ? rMonth : field === 'day' ? rDay : field === 'hour' ? rHour : rMin;
          input.style.cssText = 'width:40px;font-size:var(--font-size-base);text-align:center;padding:4px;border-radius:6px;border:1px solid var(--accent);background:var(--sub-bg);color:var(--text);outline:none;';
          if (field === 'year') input.style.width = '56px';
          valEl.replaceWith(input); input.focus(); input.select();
          function commit() {
            let v = parseInt(input.value, 10) || 0;
            if (field === 'year') { rYear = Math.max(2024, v); }
            else if (field === 'month') { rMonth = Math.max(1, Math.min(12, v)); }
            else if (field === 'day') { const max = new Date(rYear, rMonth, 0).getDate(); rDay = Math.max(1, Math.min(max, v)); }
            else if (field === 'hour') { rHour = Math.max(1, Math.min(12, v)); }
            else { rMin = Math.max(0, Math.min(59, v)); }
            renderRemindDialog();
          }
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } if (ev.key === 'Escape') renderRemindDialog(); });
        });
      });
      wrap.querySelector('#pf-remind-ok').addEventListener('click', confirmReminder);
      wrap.querySelector('#pf-remind-cancel').addEventListener('click', () => { wrap.remove(); });
    }
    function adjustField(field, dir) {
      if (field === 'year') { rYear += dir; if (rYear < 2024) rYear = 2024; }
      else if (field === 'month') { rMonth += dir; if (rMonth > 12) rMonth = 1; if (rMonth < 1) rMonth = 12; }
      else if (field === 'day') { const max = new Date(rYear, rMonth, 0).getDate(); rDay += dir; if (rDay > max) rDay = 1; if (rDay < 1) rDay = max; }
      else if (field === 'hour') { rHour += dir; if (rHour > 12) rHour = 1; if (rHour < 1) rHour = 12; }
      else if (field === 'min') { rMin += dir * 10; if (rMin >= 60) rMin = 0; if (rMin < 0) rMin = 50; }
      else if (field === 'ampm') { rAmpm = rAmpm === 'AM' ? 'PM' : 'AM'; }
      renderRemindDialog();
    }
    function confirmReminder() {
      let h24 = rHour % 12; if (rAmpm === 'PM') h24 += 12;
      const remindAt = new Date(rYear, rMonth - 1, rDay, h24, rMin).getTime();
      if (remindAt > Date.now()) {
        reminders.push({ id: uid(), sourceId: sourceId, title: title, sourceType: sourceType, remindAt: remindAt });
        saveReminders(); showToast('⏰ Reminder set for ' + new Date(remindAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      } else { showToast('Reminder must be in the future', true); }
      wrap.remove();
    }
    root.appendChild(wrap);
    renderRemindDialog();
  }
  function checkReminders() {
    const now = Date.now();
    const fired = [];
    reminders.forEach(r => {
      if (r.remindAt <= now) {
        fired.push(r);
        if (Notification.permission === 'granted') { new Notification('⏰ Reminder: ' + r.title); }
        else { showToast('⏰ Reminder: ' + r.title); }
      }
    });
    if (fired.length) { reminders = reminders.filter(r => !fired.includes(r)); saveReminders(); }
  }
  loadReminders();
  if ('Notification' in window && Notification.permission === 'default') { Notification.requestPermission(); }
  setInterval(checkReminders, 30000);
  setTimeout(checkReminders, 2000);

  let commentTarget = null;
