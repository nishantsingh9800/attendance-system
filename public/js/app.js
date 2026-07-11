// app.js — EduTrack frontend logic (vanilla JS, no frameworks)
(() => {
  'use strict';

  const state = {
    token: localStorage.getItem('et_token') || null,
    user: JSON.parse(localStorage.getItem('et_user') || 'null'),
    selectedRole: 'student',
  };

  const DEMO_CREDS = {
    student: 'student1 / pass123',
    faculty: 'faculty1 / pass123',
  };

  // ------------------------------------------------------------------
  // API helper
  // ------------------------------------------------------------------
  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(path, Object.assign({}, options, { headers }));
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ------------------------------------------------------------------
  // SVG progress ring
  // ------------------------------------------------------------------
  function paintRing(svgEl, pct, colorVar) {
    const radius = 50;
    const stroke = 10;
    const norm = radius - stroke / 2;
    const circumference = 2 * Math.PI * norm;
    const value = pct === null ? 0 : pct;
    const offset = circumference - (value / 100) * circumference;
    const color = value >= 85 ? 'var(--success)' : value >= 60 ? 'var(--warning)' : 'var(--danger)';

    svgEl.innerHTML = `
      <circle cx="60" cy="60" r="${norm}" stroke="var(--border)" stroke-width="${stroke}" fill="none"/>
      <circle cx="60" cy="60" r="${norm}" stroke="${color}" stroke-width="${stroke}" fill="none"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        style="transition: stroke-dashoffset 0.6s ease;"/>
    `;
  }

  // ------------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------------
  function initLogin() {
    const tabs = document.querySelectorAll('.role-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.selectedRole = tab.dataset.role;
        document.getElementById('demo-cred').textContent = DEMO_CREDS[state.selectedRole];
        document.getElementById('login-error').classList.add('hidden');
      });
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const errBox = document.getElementById('login-error');
      const submitBtn = document.getElementById('login-submit');
      errBox.classList.add('hidden');
      submitBtn.textContent = 'Signing in...';
      submitBtn.disabled = true;

      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ role: state.selectedRole, username, password }),
        });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('et_token', data.token);
        localStorage.setItem('et_user', JSON.stringify(data.user));
        enterApp();
      } catch (err) {
        errBox.textContent = err.message || 'Login failed';
        errBox.classList.remove('hidden');
      } finally {
        submitBtn.textContent = 'Sign In';
        submitBtn.disabled = false;
      }
    });
  }

  // ------------------------------------------------------------------
  // SIGN UP
  // ------------------------------------------------------------------
  let signupRole = 'student';
  let availableClassesCache = null;

  function initSignup() {
    document.getElementById('show-signup').addEventListener('click', () => {
      document.querySelector('.login-card:not(#signup-card)').classList.add('hidden');
      document.getElementById('signup-card').classList.remove('hidden');
      if (signupRole === 'student') loadSignupClassOptions();
    });
    document.getElementById('show-login').addEventListener('click', () => {
      document.getElementById('signup-card').classList.add('hidden');
      document.querySelector('.login-card:not(#signup-card)').classList.remove('hidden');
      document.getElementById('signup-error').classList.add('hidden');
    });

    const signupTabs = [document.getElementById('signup-tab-student'), document.getElementById('signup-tab-faculty')];
    signupTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        signupTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        signupRole = tab.dataset.role;
        const isStudent = signupRole === 'student';
        document.getElementById('signup-student-fields').classList.toggle('hidden', !isStudent);
        document.getElementById('signup-faculty-fields').classList.toggle('hidden', isStudent);
        if (isStudent) loadSignupClassOptions();
      });
    });

    document.getElementById('signup-form').addEventListener('submit', handleSignupSubmit);
  }

  async function loadSignupClassOptions() {
    const container = document.getElementById('signup-class-list');
    if (availableClassesCache) return renderSignupClassOptions(availableClassesCache);
    try {
      const data = await api('/api/public/classes');
      availableClassesCache = data.classes;
      renderSignupClassOptions(availableClassesCache);
    } catch (err) {
      container.innerHTML = '<div class="empty-note">Could not load classes.</div>';
    }
  }

  function renderSignupClassOptions(classes) {
    const container = document.getElementById('signup-class-list');
    if (!classes.length) {
      container.innerHTML = '<div class="empty-note">No classes available yet.</div>';
      return;
    }
    container.innerHTML = classes.map(c => `
      <label class="signup-class-option">
        <input type="checkbox" value="${c.id}">
        <span>${c.name} <span class="opt-sub">(${c.subject})</span></span>
      </label>
    `).join('');
  }

  async function handleSignupSubmit(e) {
    e.preventDefault();
    const errBox = document.getElementById('signup-error');
    const submitBtn = document.getElementById('signup-submit');
    errBox.classList.add('hidden');

    const payload = {
      role: signupRole,
      name: document.getElementById('signup-name').value.trim(),
      username: document.getElementById('signup-username').value.trim(),
      password: document.getElementById('signup-password').value,
    };

    if (signupRole === 'student') {
      payload.rollNo = document.getElementById('signup-rollno').value.trim();
      payload.classIds = Array.from(document.querySelectorAll('#signup-class-list input[type=checkbox]:checked')).map(cb => cb.value);
    } else {
      payload.department = document.getElementById('signup-department').value.trim();
    }

    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;
    try {
      const data = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('et_token', data.token);
      localStorage.setItem('et_user', JSON.stringify(data.user));
      showToast('Account created — welcome!');
      document.getElementById('signup-form').reset();
      enterApp();
    } catch (err) {
      errBox.textContent = err.message || 'Could not create account';
      errBox.classList.remove('hidden');
    } finally {
      submitBtn.textContent = 'Create Account';
      submitBtn.disabled = false;
    }
  }

  function logout() {
    api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    state.token = null;
    state.user = null;
    localStorage.removeItem('et_token');
    localStorage.removeItem('et_user');
    document.getElementById('student-app').classList.add('hidden');
    document.getElementById('faculty-app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-form').reset();
    document.getElementById('signup-card').classList.add('hidden');
    document.querySelector('.login-card:not(#signup-card)').classList.remove('hidden');
  }

  // ------------------------------------------------------------------
  // APP ENTRY
  // ------------------------------------------------------------------
  function enterApp() {
    document.getElementById('login-screen').classList.add('hidden');
    if (state.user.role === 'student') {
      document.getElementById('student-app').classList.remove('hidden');
      initStudentApp();
    } else {
      document.getElementById('faculty-app').classList.remove('hidden');
      initFacultyApp();
    }
  }

  // ==================================================================
  // STUDENT APP
  // ==================================================================
  let studentDashboardCache = null;

  function initStudentApp() {
    document.getElementById('student-name').textContent = state.user.name;
    document.getElementById('student-avatar').textContent = state.user.name.charAt(0).toUpperCase();
    document.getElementById('student-roll').textContent = state.user.rollNo || '';
    document.getElementById('student-date').textContent = formatDate(new Date());
    document.getElementById('student-logout').addEventListener('click', logout);

    // nav
    const navItems = document.querySelectorAll('#student-app .nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view;
        document.querySelectorAll('#student-app .view').forEach(v => v.classList.remove('active'));
        document.querySelector(`#student-app .view[data-view="${view}"]`).classList.add('active');
        document.getElementById('student-view-title').textContent = item.textContent.trim().replace(/^\S+\s/, '');
        document.getElementById('student-app').querySelector('.sidebar').classList.remove('open');
        if (view === 'attendance') loadHistory('daily');
      });
    });

    document.getElementById('student-menu-btn').addEventListener('click', () => {
      document.querySelector('#student-app .sidebar').classList.toggle('open');
    });

    // period toggle within history view
    document.querySelectorAll('#student-attendance .period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#student-attendance .period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadHistory(btn.dataset.period);
      });
    });

    loadStudentDashboard();
  }

  async function loadStudentDashboard() {
    try {
      const data = await api('/api/student/dashboard');
      studentDashboardCache = data;
      renderStudentOverview(data);
      renderWeekSchedule(data.weekSchedule);
    } catch (err) {
      showToast(err.message);
    }
  }

  function renderStudentOverview(data) {
    const cards = document.querySelectorAll('#student-overview .stat-card');
    const periodLabelMap = {
      daily: (s) => s.total ? `${s.present}/${s.total} classes` : 'No classes today',
      weekly: (s) => s.total ? `${s.present}/${s.total} classes` : 'No records',
      monthly: (s) => s.total ? `${s.present}/${s.total} classes` : 'No records',
      yearly: (s) => s.total ? `${s.present}/${s.total} classes` : 'No records',
    };
    cards.forEach(card => {
      const period = card.dataset.period;
      const s = data.summary[period];
      const ring = card.querySelector('.ring');
      const valueEl = card.querySelector('.ring-value');
      const subEl = card.querySelector('.stat-sub');
      paintRing(ring, s.percentage);
      valueEl.textContent = s.percentage === null ? '—' : s.percentage + '%';
      subEl.textContent = periodLabelMap[period](s);
    });

    // today's classes
    const container = document.getElementById('todays-classes');
    container.innerHTML = '';
    if (!data.todaysClasses.length) {
      container.innerHTML = '<div class="empty-note">No classes scheduled for today. Enjoy your day! 🎉</div>';
    } else {
      data.todaysClasses.forEach(c => {
        const row = document.createElement('div');
        row.className = 'class-row';
        const statusHtml = c.marked
          ? `<span class="status-pill ${c.status}">${c.status === 'present' ? 'Present' : 'Absent'}</span>`
          : `<span class="status-pill pending">Not marked yet</span>`;
        row.innerHTML = `
          <div class="class-row-left">
            <div class="class-time-badge">${c.time}</div>
            <div>
              <div class="class-info-name">${c.name}</div>
              <div class="class-info-sub">${c.subject} · ${c.faculty}</div>
            </div>
          </div>
          ${statusHtml}
        `;
        container.appendChild(row);
      });
    }

    // per-class bars
    const perClassEl = document.getElementById('per-class-list');
    perClassEl.innerHTML = '';
    if (!data.perClass.length) {
      perClassEl.innerHTML = '<div class="empty-note">No classes enrolled.</div>';
    }
    data.perClass.forEach(c => {
      const pct = c.percentage === null ? 0 : c.percentage;
      const item = document.createElement('div');
      item.className = 'per-class-item';
      item.innerHTML = `
        <div class="per-class-top">
          <span class="name">${c.name} <span style="color:var(--text-faint); font-weight:500;">(${c.subject})</span></span>
          <span class="pct">${c.percentage === null ? '—' : c.percentage + '%'}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="per-class-sub">${c.faculty} · ${c.present}/${c.total} classes attended</div>
      `;
      perClassEl.appendChild(item);
    });
  }

  function renderWeekSchedule(weekSchedule) {
    const container = document.getElementById('week-schedule');
    container.innerHTML = '';
    const byDay = {};
    weekSchedule.forEach(item => {
      byDay[item.day] = byDay[item.day] || [];
      byDay[item.day].push(item);
    });
    const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    dayOrder.forEach(day => {
      if (!byDay[day]) return;
      const group = document.createElement('div');
      group.className = 'week-day-group';
      const rows = byDay[day].map(item => `
        <div class="week-day-row">
          <div>
            <div class="name">${item.name}</div>
            <div class="sub">${item.subject}</div>
          </div>
          <div class="time">${item.time}</div>
        </div>
      `).join('');
      group.innerHTML = `<div class="week-day-header">${day}</div>${rows}`;
      container.appendChild(group);
    });
    if (!Object.keys(byDay).length) {
      container.innerHTML = '<div class="empty-note">No classes scheduled.</div>';
    }
  }

  async function loadHistory(period) {
    try {
      const data = await api(`/api/student/attendance?period=${period}`);
      const summaryEl = document.getElementById('history-summary');
      const s = data.summary;
      summaryEl.innerHTML = `
        <div>Attendance: <b style="color:var(--primary)">${s.percentage === null ? '—' : s.percentage + '%'}</b></div>
        <div>Present: <b style="color:var(--success)">${s.present}</b></div>
        <div>Absent: <b style="color:var(--danger)">${s.absent}</b></div>
        <div>Total classes: <b>${s.total}</b></div>
      `;
      const tbody = document.querySelector('#history-table tbody');
      tbody.innerHTML = '';
      const emptyState = document.getElementById('history-empty');
      if (!data.records.length) {
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
        data.records.forEach(r => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.subject}</td>
            <td>${r.className}</td>
            <td><span class="status-pill ${r.status}">${r.status === 'present' ? 'Present' : 'Absent'}</span></td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      showToast(err.message);
    }
  }

  // ==================================================================
  // FACULTY APP
  // ==================================================================
  let currentModalClass = null; // { classId, date }
  let rosterState = [];

  function initFacultyApp() {
    document.getElementById('faculty-name').textContent = state.user.name;
    document.getElementById('faculty-avatar').textContent = state.user.name.charAt(0).toUpperCase();
    document.getElementById('faculty-dept').textContent = state.user.department || '';
    document.getElementById('faculty-date').textContent = formatDate(new Date());
    document.getElementById('faculty-logout').addEventListener('click', logout);
    document.getElementById('faculty-menu-btn').addEventListener('click', () => {
      document.querySelector('#faculty-app .sidebar').classList.toggle('open');
    });

    const facNavItems = document.querySelectorAll('#faculty-app .nav-item');
    facNavItems.forEach(item => {
      item.addEventListener('click', () => {
        facNavItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view;
        document.querySelectorAll('#faculty-app .view').forEach(v => v.classList.remove('active'));
        document.querySelector(`#faculty-app .view[data-view="${view}"]`).classList.add('active');
        document.getElementById('faculty-view-title').textContent = item.textContent.trim().replace(/^\S+\s/, '');
        document.getElementById('faculty-app').querySelector('.sidebar').classList.remove('open');
        if (view === 'fcreate') initCreateClassForm();
      });
    });

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('attendance-modal').addEventListener('click', (e) => {
      if (e.target.id === 'attendance-modal') closeModal();
    });
    document.getElementById('modal-date-input').addEventListener('change', (e) => {
      loadRoster(currentModalClass.classId, e.target.value);
    });
    document.getElementById('mark-all-present').addEventListener('click', () => {
      rosterState.forEach(r => r.status = 'present');
      renderRoster();
    });
    document.getElementById('mark-all-absent').addEventListener('click', () => {
      rosterState.forEach(r => r.status = 'absent');
      renderRoster();
    });
    document.getElementById('save-attendance-btn').addEventListener('click', saveAttendance);

    document.getElementById('students-modal-close-btn').addEventListener('click', closeStudentsModal);
    document.getElementById('students-modal').addEventListener('click', (e) => {
      if (e.target.id === 'students-modal') closeStudentsModal();
    });
    document.getElementById('save-roster-btn').addEventListener('click', saveRoster);

    loadFacultyDashboard();
  }

  async function loadFacultyDashboard() {
    try {
      const data = await api('/api/faculty/dashboard');
      const grid = document.getElementById('faculty-class-grid');
      grid.innerHTML = '';
      if (!data.classes.length) {
        grid.innerHTML = '<div class="empty-note">No classes assigned.</div>';
        return;
      }
      data.classes.forEach(c => {
        const card = document.createElement('div');
        card.className = 'faculty-card';
        const scheduleStr = c.schedule.map(s => `${s.day.slice(0,3)} ${s.time}`).join(' · ');
        card.innerHTML = `
          <div class="faculty-card-top">
            <div>
              <div class="faculty-card-title">${c.name}</div>
              <div class="faculty-card-sub">${c.subject}</div>
            </div>
            ${c.isToday ? `<span class="today-badge">Today ${c.timeToday}</span>` : ''}
          </div>
          <div class="faculty-card-meta">
            <span>👥 <b>${c.studentCount}</b> students enrolled</span>
            <span>🗓️ ${scheduleStr}</span>
            <span>${c.markedToday ? `✅ Marked today (<b>${c.presentToday}</b> present)` : '⚠️ Not marked for today yet'}</span>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary mark-btn" style="flex:1;" data-class-id="${c.classId}" data-class-name="${c.name}" data-class-sub="${c.subject}">
              Mark Attendance
            </button>
            <button class="btn btn-outline manage-btn" style="flex:1;" data-class-id="${c.classId}" data-class-name="${c.name}" data-class-sub="${c.subject}">
              Manage Students
            </button>
          </div>
        `;
        grid.appendChild(card);
      });

      grid.querySelectorAll('.mark-btn').forEach(btn => {
        btn.addEventListener('click', () => openModal(btn.dataset.classId, btn.dataset.className, btn.dataset.classSub));
      });
      grid.querySelectorAll('.manage-btn').forEach(btn => {
        btn.addEventListener('click', () => openStudentsModal(btn.dataset.classId, btn.dataset.className, btn.dataset.classSub));
      });
    } catch (err) {
      showToast(err.message);
    }
  }

  function openModal(classId, className, classSub) {
    currentModalClass = { classId };
    document.getElementById('modal-class-name').textContent = className;
    document.getElementById('modal-class-sub').textContent = classSub;
    const dateInput = document.getElementById('modal-date-input');
    const today = new Date().toISOString().slice(0, 10);
    dateInput.value = today;
    dateInput.max = today;
    document.getElementById('modal-save-msg').textContent = '';
    document.getElementById('attendance-modal').classList.remove('hidden');
    loadRoster(classId, today);
  }

  function closeModal() {
    document.getElementById('attendance-modal').classList.add('hidden');
    currentModalClass = null;
    rosterState = [];
  }

  async function loadRoster(classId, date) {
    try {
      const data = await api(`/api/faculty/class/${classId}/roster?date=${date}`);
      rosterState = data.roster.map(r => ({ ...r, status: r.status || 'present' }));
      renderRoster();
    } catch (err) {
      showToast(err.message);
    }
  }

  function renderRoster() {
    const container = document.getElementById('modal-roster');
    container.innerHTML = '';
    rosterState.forEach((r, idx) => {
      const row = document.createElement('div');
      row.className = 'roster-row';
      row.innerHTML = `
        <div>
          <div class="roster-name">${r.name}</div>
          <div class="roster-roll">${r.rollNo}</div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn present ${r.status === 'present' ? 'selected' : ''}" data-idx="${idx}" data-status="present">Present</button>
          <button class="toggle-btn absent ${r.status === 'absent' ? 'selected' : ''}" data-idx="${idx}" data-status="absent">Absent</button>
        </div>
      `;
      container.appendChild(row);
    });
    container.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        rosterState[idx].status = btn.dataset.status;
        renderRoster();
      });
    });
  }

  async function saveAttendance() {
    const date = document.getElementById('modal-date-input').value;
    const saveBtn = document.getElementById('save-attendance-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await api('/api/faculty/attendance', {
        method: 'POST',
        body: JSON.stringify({
          classId: currentModalClass.classId,
          date,
          records: rosterState.map(r => ({ studentId: r.studentId, status: r.status })),
        }),
      });
      document.getElementById('modal-save-msg').textContent = 'Saved ✓';
      showToast('Attendance saved successfully');
      loadFacultyDashboard();
      setTimeout(() => { document.getElementById('modal-save-msg').textContent = ''; }, 2000);
    } catch (err) {
      showToast(err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Attendance';
    }
  }

  // ------------------------------------------------------------------
  // MANAGE STUDENTS MODAL (view full roster + toggle enrollment)
  // ------------------------------------------------------------------
  let studentsModalClassId = null;
  let studentsModalState = [];

  async function openStudentsModal(classId, className, classSub) {
    studentsModalClassId = classId;
    document.getElementById('students-modal-class-name').textContent = className;
    document.getElementById('students-modal-class-sub').textContent = classSub;
    document.getElementById('students-modal-msg').textContent = '';
    document.getElementById('students-modal').classList.remove('hidden');
    document.getElementById('students-modal-list').innerHTML = '<div class="empty-note">Loading...</div>';
    try {
      const data = await api(`/api/faculty/class/${classId}/students-detail`);
      studentsModalState = data.students;
      renderStudentsModalList();
    } catch (err) {
      showToast(err.message);
    }
  }

  function closeStudentsModal() {
    document.getElementById('students-modal').classList.add('hidden');
    studentsModalClassId = null;
    studentsModalState = [];
  }

  function renderStudentsModalList() {
    const container = document.getElementById('students-modal-list');
    container.innerHTML = '';
    studentsModalState.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'roster-row';
      const pctText = s.enrolled
        ? (s.percentage === null ? 'No attendance recorded yet' : `${s.percentage}% attendance (${s.present}/${s.total})`)
        : 'Not enrolled';
      row.innerHTML = `
        <div>
          <div class="roster-name">${s.name}</div>
          <div class="roster-roll">${s.rollNo}</div>
          <div class="roster-pct">${pctText}</div>
        </div>
        <label class="signup-class-option" style="padding:0;">
          <input type="checkbox" data-idx="${idx}" ${s.enrolled ? 'checked' : ''}>
          <span>Enrolled</span>
        </label>
      `;
      container.appendChild(row);
    });
    container.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        studentsModalState[Number(cb.dataset.idx)].enrolled = cb.checked;
      });
    });
  }

  async function saveRoster() {
    const btn = document.getElementById('save-roster-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const studentIds = studentsModalState.filter(s => s.enrolled).map(s => s.studentId);
      await api(`/api/faculty/class/${studentsModalClassId}/students`, {
        method: 'PUT',
        body: JSON.stringify({ studentIds }),
      });
      document.getElementById('students-modal-msg').textContent = 'Saved ✓';
      showToast('Roster updated');
      loadFacultyDashboard();
      setTimeout(() => { document.getElementById('students-modal-msg').textContent = ''; }, 2000);
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  }

  // ------------------------------------------------------------------
  // CREATE CLASS FORM (faculty schedules their own classes)
  // ------------------------------------------------------------------
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  let createClassInitialized = false;
  let createClassStudentsCache = null;

  function initCreateClassForm() {
    if (!createClassInitialized) {
      createClassInitialized = true;
      document.getElementById('cc-add-slot').addEventListener('click', () => addScheduleRow());
      document.getElementById('create-class-form').addEventListener('submit', handleCreateClassSubmit);
      addScheduleRow(); // start with one row
    }
    loadCreateClassStudents();
  }

  function addScheduleRow() {
    const container = document.getElementById('cc-schedule-rows');
    const row = document.createElement('div');
    row.className = 'schedule-row';
    row.innerHTML = `
      <select class="cc-day">${DAYS.map(d => `<option value="${d}">${d}</option>`).join('')}</select>
      <input type="time" class="cc-start" value="09:00">
      <span class="time-sep">–</span>
      <input type="time" class="cc-end" value="10:00">
      <button type="button" class="remove-slot" title="Remove">✕</button>
    `;
    row.querySelector('.remove-slot').addEventListener('click', () => {
      if (document.querySelectorAll('.schedule-row').length > 1) row.remove();
    });
    container.appendChild(row);
  }

  async function loadCreateClassStudents() {
    const container = document.getElementById('cc-student-list');
    if (createClassStudentsCache) return renderCreateClassStudents(createClassStudentsCache);
    try {
      const data = await api('/api/faculty/students');
      createClassStudentsCache = data.students;
      renderCreateClassStudents(createClassStudentsCache);
    } catch (err) {
      container.innerHTML = '<div class="empty-note">Could not load students.</div>';
    }
  }

  function renderCreateClassStudents(students) {
    const container = document.getElementById('cc-student-list');
    if (!students.length) {
      container.innerHTML = '<div class="empty-note">No students registered yet.</div>';
      return;
    }
    container.innerHTML = students.map(s => `
      <label class="signup-class-option">
        <input type="checkbox" value="${s.id}">
        <span>${s.name} <span class="opt-sub">(${s.rollNo})</span></span>
      </label>
    `).join('');
  }

  async function handleCreateClassSubmit(e) {
    e.preventDefault();
    const errBox = document.getElementById('cc-error');
    const submitBtn = document.getElementById('cc-submit');
    errBox.classList.add('hidden');

    const schedule = Array.from(document.querySelectorAll('.schedule-row')).map(row => {
      const day = row.querySelector('.cc-day').value;
      const start = row.querySelector('.cc-start').value;
      const end = row.querySelector('.cc-end').value;
      return { day, time: `${start}-${end}` };
    });
    const studentIds = Array.from(document.querySelectorAll('#cc-student-list input[type=checkbox]:checked')).map(cb => cb.value);

    const payload = {
      name: document.getElementById('cc-name').value.trim(),
      subject: document.getElementById('cc-subject').value.trim(),
      schedule,
      studentIds,
    };

    submitBtn.textContent = 'Creating...';
    submitBtn.disabled = true;
    try {
      await api('/api/faculty/classes', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Class created successfully');
      document.getElementById('create-class-form').reset();
      document.querySelectorAll('.schedule-row').forEach((row, i) => { if (i > 0) row.remove(); });
      document.querySelectorAll('#cc-student-list input[type=checkbox]').forEach(cb => cb.checked = false);
      // switch back to My Classes to show the new card
      document.querySelector('#faculty-app .nav-item[data-view="fclasses"]').click();
    } catch (err) {
      errBox.textContent = err.message || 'Could not create class';
      errBox.classList.remove('hidden');
    } finally {
      submitBtn.textContent = 'Create Class';
      submitBtn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // BOOTSTRAP
  // ------------------------------------------------------------------
  initLogin();
  initSignup();
  if (state.token && state.user) {
    enterApp();
  }
})();
