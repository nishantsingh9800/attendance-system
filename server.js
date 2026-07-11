// server.js — Student Attendance System backend
// Pure Node.js (http + fs only, zero external dependencies) so it runs anywhere.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// Tiny JSON "database" helpers (file-backed, read/write on every request —
// perfectly fine for a demo / small deployment; swap for real DB in production)
// ---------------------------------------------------------------------------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// In-memory session store: token -> { userId, role }
const sessions = new Map();

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getAuth(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !sessions.has(token)) return null;
  return sessions.get(token);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function parseDate(s) { return new Date(s + 'T00:00:00'); }

function isWithinDays(dateStr, days, refDate) {
  const d = parseDate(dateStr);
  const diff = (refDate - d) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff < days;
}
function isSameMonth(dateStr, refDate) {
  const d = parseDate(dateStr);
  return d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth();
}
function isSameYear(dateStr, refDate) {
  const d = parseDate(dateStr);
  return d.getFullYear() === refDate.getFullYear();
}

function summarize(records) {
  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const percentage = total === 0 ? null : Math.round((present / total) * 1000) / 10;
  return { total, present, absent: total - present, percentage };
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Static file serving for the frontend
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback -> index.html
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, c2) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(c2);
        });
        return;
      }
      res.writeHead(500); return res.end('Server error');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------------------------------------------------------------------------
// API route handlers
// ---------------------------------------------------------------------------
async function handleApi(req, res, pathname, query) {
  // ---- LOGIN (no auth required) ----
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const { role, username, password } = body;
    const db = readDB();
    const table = role === 'student' ? db.students : role === 'faculty' ? db.faculty : null;
    if (!table) return sendJSON(res, 400, { success: false, message: 'Invalid role' });

    const user = table.find(u => u.username === username && u.password === password);
    if (!user) return sendJSON(res, 401, { success: false, message: 'Invalid username or password' });

    const token = makeToken();
    sessions.set(token, { userId: user.id, role });
    const { password: _pw, ...safeUser } = user;
    return sendJSON(res, 200, { success: true, token, user: { ...safeUser, role } });
  }

  // Public list of classes (name/subject/schedule only) so a new student can
  // pick which ones to enroll in during sign-up. No auth required.
  if (pathname === '/api/public/classes' && req.method === 'GET') {
    const db = readDB();
    const list = db.classes.map(c => ({ id: c.id, name: c.name, subject: c.subject, schedule: c.schedule }));
    return sendJSON(res, 200, { success: true, classes: list });
  }

  // ---- SIGN UP (no auth required) ----
  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const { role, name, username, password } = body;

    if (!role || !['student', 'faculty'].includes(role)) {
      return sendJSON(res, 400, { success: false, message: 'Invalid role' });
    }
    if (!name || !username || !password) {
      return sendJSON(res, 400, { success: false, message: 'Name, username and password are required' });
    }
    if (username.length < 3 || password.length < 4) {
      return sendJSON(res, 400, { success: false, message: 'Username must be 3+ chars and password 4+ chars' });
    }

    const db = readDB();
    const table = role === 'student' ? db.students : db.faculty;

    if (table.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return sendJSON(res, 409, { success: false, message: 'That username is already taken' });
    }

    let newUser;
    if (role === 'student') {
      const { rollNo, classIds } = body;
      if (!rollNo) return sendJSON(res, 400, { success: false, message: 'Roll number is required' });
      if (db.students.some(s => s.rollNo.toLowerCase() === rollNo.toLowerCase())) {
        return sendJSON(res, 409, { success: false, message: 'That roll number is already registered' });
      }
      const chosenClassIds = Array.isArray(classIds) ? classIds.filter(id => db.classes.some(c => c.id === id)) : [];
      newUser = { id: 's' + Date.now(), username, password, name, rollNo, classIds: chosenClassIds };
      db.students.push(newUser);
      // Add this student to the roster of every class they enrolled in
      chosenClassIds.forEach(cid => {
        const cls = db.classes.find(c => c.id === cid);
        if (cls && !cls.studentIds.includes(newUser.id)) cls.studentIds.push(newUser.id);
      });
    } else {
      const { department } = body;
      newUser = { id: 'f' + Date.now(), username, password, name, department: department || 'Not specified' };
      db.faculty.push(newUser);
    }

    writeDB(db);

    // Auto-login the newly created account
    const token = makeToken();
    sessions.set(token, { userId: newUser.id, role });
    const { password: _pw, ...safeUser } = newUser;
    return sendJSON(res, 201, { success: true, token, user: { ...safeUser, role } });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) sessions.delete(token);
    return sendJSON(res, 200, { success: true });
  }

  // ---- Everything below requires auth ----
  const auth = getAuth(req);
  if (!auth) return sendJSON(res, 401, { success: false, message: 'Not authenticated' });
  const db = readDB();

  // ============================= STUDENT ROUTES =============================
  if (auth.role === 'student') {
    const student = db.students.find(s => s.id === auth.userId);
    if (!student) return sendJSON(res, 404, { success: false, message: 'Student not found' });

    if (pathname === '/api/student/dashboard' && req.method === 'GET') {
      const ref = parseDate(todayStr());
      const myClasses = db.classes.filter(c => student.classIds.includes(c.id));
      const myRecords = db.attendance.filter(a => a.studentId === student.id);

      const daily = summarize(myRecords.filter(r => r.date === todayStr()));
      const weekly = summarize(myRecords.filter(r => isWithinDays(r.date, 7, ref)));
      const monthly = summarize(myRecords.filter(r => isSameMonth(r.date, ref)));
      const yearly = summarize(myRecords.filter(r => isSameYear(r.date, ref)));

      const perClass = myClasses.map(c => {
        const recs = myRecords.filter(r => r.classId === c.id);
        const facultyName = (db.faculty.find(f => f.id === c.facultyId) || {}).name || 'TBD';
        return { classId: c.id, name: c.name, subject: c.subject, faculty: facultyName, ...summarize(recs) };
      });

      const todayName = DAY_NAMES[new Date().getDay()];
      const todaysClasses = myClasses
        .filter(c => c.schedule.some(s => s.day === todayName))
        .map(c => {
          const slot = c.schedule.find(s => s.day === todayName);
          const already = myRecords.find(r => r.classId === c.id && r.date === todayStr());
          const facultyName = (db.faculty.find(f => f.id === c.facultyId) || {}).name || 'TBD';
          return { classId: c.id, name: c.name, subject: c.subject, time: slot.time, faculty: facultyName,
                   marked: !!already, status: already ? already.status : null };
        })
        .sort((a, b) => a.time.localeCompare(b.time));

      const weekSchedule = myClasses.flatMap(c =>
        c.schedule.map(s => ({ classId: c.id, name: c.name, subject: c.subject, day: s.day, time: s.time }))
      );
      const dayOrder = { Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4, Saturday:5, Sunday:6 };
      weekSchedule.sort((a, b) => (dayOrder[a.day] - dayOrder[b.day]) || a.time.localeCompare(b.time));

      return sendJSON(res, 200, {
        success: true,
        student: { id: student.id, name: student.name, rollNo: student.rollNo },
        summary: { daily, weekly, monthly, yearly },
        perClass,
        todaysClasses,
        weekSchedule,
      });
    }

    if (pathname === '/api/student/attendance' && req.method === 'GET') {
      const period = query.period || 'weekly';
      const classId = query.classId || null;
      const ref = parseDate(todayStr());
      let recs = db.attendance.filter(r => r.studentId === student.id);
      if (classId) recs = recs.filter(r => r.classId === classId);

      if (period === 'daily') recs = recs.filter(r => r.date === todayStr());
      else if (period === 'weekly') recs = recs.filter(r => isWithinDays(r.date, 7, ref));
      else if (period === 'monthly') recs = recs.filter(r => isSameMonth(r.date, ref));
      else if (period === 'yearly') recs = recs.filter(r => isSameYear(r.date, ref));

      recs = recs.slice().sort((a, b) => b.date.localeCompare(a.date));
      const withNames = recs.map(r => {
        const cls = db.classes.find(c => c.id === r.classId);
        return { date: r.date, status: r.status, className: cls ? cls.name : r.classId, subject: cls ? cls.subject : '' };
      });

      return sendJSON(res, 200, { success: true, period, summary: summarize(recs), records: withNames });
    }

    return sendJSON(res, 404, { success: false, message: 'Not found' });
  }

  // ============================= FACULTY ROUTES =============================
  if (auth.role === 'faculty') {
    const fac = db.faculty.find(f => f.id === auth.userId);
    if (!fac) return sendJSON(res, 404, { success: false, message: 'Faculty not found' });

    if (pathname === '/api/faculty/dashboard' && req.method === 'GET') {
      const myClasses = db.classes.filter(c => c.facultyId === fac.id);
      const todayName = DAY_NAMES[new Date().getDay()];
      const dateStr = todayStr();

      const classSummaries = myClasses.map(c => {
        const todaysRecs = db.attendance.filter(a => a.classId === c.id && a.date === dateStr);
        const slotToday = c.schedule.find(s => s.day === todayName);
        return {
          classId: c.id, name: c.name, subject: c.subject, studentCount: c.studentIds.length,
          schedule: c.schedule, isToday: !!slotToday, timeToday: slotToday ? slotToday.time : null,
          markedToday: todaysRecs.length > 0,
          presentToday: todaysRecs.filter(r => r.status === 'present').length,
        };
      });

      return sendJSON(res, 200, {
        success: true,
        faculty: { id: fac.id, name: fac.name, department: fac.department },
        classes: classSummaries,
      });
    }

    // list of all students in the system (for enrollment pickers)
    if (pathname === '/api/faculty/students' && req.method === 'GET') {
      const list = db.students.map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo }))
        .sort((a, b) => a.rollNo.localeCompare(b.rollNo));
      return sendJSON(res, 200, { success: true, students: list });
    }

    // create a brand-new class, scheduled and owned by this faculty member
    if (pathname === '/api/faculty/classes' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, subject, schedule, studentIds } = body;
      if (!name || !subject || !Array.isArray(schedule) || !schedule.length) {
        return sendJSON(res, 400, { success: false, message: 'Name, subject and at least one schedule slot are required' });
      }
      const validDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const cleanSchedule = schedule.filter(s => s && validDays.includes(s.day) && s.time);
      if (!cleanSchedule.length) return sendJSON(res, 400, { success: false, message: 'Invalid schedule' });

      const cleanStudentIds = Array.isArray(studentIds) ? studentIds.filter(id => db.students.some(s => s.id === id)) : [];
      const newClass = {
        id: 'c' + Date.now(), name, subject, facultyId: fac.id,
        schedule: cleanSchedule, studentIds: cleanStudentIds,
      };
      db.classes.push(newClass);
      // keep each enrolled student's classIds in sync
      cleanStudentIds.forEach(sid => {
        const st = db.students.find(s => s.id === sid);
        if (st && !st.classIds.includes(newClass.id)) st.classIds.push(newClass.id);
      });
      writeDB(db);
      return sendJSON(res, 201, { success: true, class: newClass });
    }

    // full roster (every student in the system, with enrolled flag + attendance % for this class)
    if (pathname.match(/^\/api\/faculty\/class\/[^/]+\/students-detail$/) && req.method === 'GET') {
      const classId = pathname.split('/')[4];
      const cls = db.classes.find(c => c.id === classId && c.facultyId === fac.id);
      if (!cls) return sendJSON(res, 404, { success: false, message: 'Class not found' });

      const list = db.students.map(s => {
        const enrolled = cls.studentIds.includes(s.id);
        const recs = db.attendance.filter(a => a.classId === classId && a.studentId === s.id);
        const stats = summarize(recs);
        return { studentId: s.id, name: s.name, rollNo: s.rollNo, enrolled, ...stats };
      }).sort((a, b) => a.rollNo.localeCompare(b.rollNo));

      return sendJSON(res, 200, { success: true, className: cls.name, subject: cls.subject, students: list });
    }

    // replace the enrolled roster for a class
    if (pathname.match(/^\/api\/faculty\/class\/[^/]+\/students$/) && req.method === 'PUT') {
      const classId = pathname.split('/')[4];
      const cls = db.classes.find(c => c.id === classId && c.facultyId === fac.id);
      if (!cls) return sendJSON(res, 404, { success: false, message: 'Class not found' });
      const body = await readBody(req);
      const { studentIds } = body;
      if (!Array.isArray(studentIds)) return sendJSON(res, 400, { success: false, message: 'Invalid payload' });

      const newIds = studentIds.filter(id => db.students.some(s => s.id === id));
      const removedIds = cls.studentIds.filter(id => !newIds.includes(id));
      const addedIds = newIds.filter(id => !cls.studentIds.includes(id));

      cls.studentIds = newIds;
      addedIds.forEach(sid => {
        const st = db.students.find(s => s.id === sid);
        if (st && !st.classIds.includes(classId)) st.classIds.push(classId);
      });
      removedIds.forEach(sid => {
        const st = db.students.find(s => s.id === sid);
        if (st) st.classIds = st.classIds.filter(cid => cid !== classId);
      });

      writeDB(db);
      return sendJSON(res, 200, { success: true, message: 'Roster updated' });
    }

    // roster + existing attendance (if any) for a given class/date
    if (pathname.match(/^\/api\/faculty\/class\/[^/]+\/roster$/) && req.method === 'GET') {
      const classId = pathname.split('/')[4];
      const cls = db.classes.find(c => c.id === classId && c.facultyId === fac.id);
      if (!cls) return sendJSON(res, 404, { success: false, message: 'Class not found' });
      const date = query.date || todayStr();

      const roster = cls.studentIds.map(sid => {
        const s = db.students.find(st => st.id === sid);
        const existing = db.attendance.find(a => a.classId === classId && a.studentId === sid && a.date === date);
        return { studentId: sid, name: s ? s.name : sid, rollNo: s ? s.rollNo : '', status: existing ? existing.status : null };
      });
      roster.sort((a, b) => a.rollNo.localeCompare(b.rollNo));

      return sendJSON(res, 200, { success: true, className: cls.name, subject: cls.subject, date, roster });
    }

    // mark / update attendance for a class on a date
    if (pathname === '/api/faculty/attendance' && req.method === 'POST') {
      const body = await readBody(req);
      const { classId, date, records } = body; // records: [{studentId, status}]
      const cls = db.classes.find(c => c.id === classId && c.facultyId === fac.id);
      if (!cls) return sendJSON(res, 404, { success: false, message: 'Class not found or not yours' });
      if (!date || !Array.isArray(records)) return sendJSON(res, 400, { success: false, message: 'Invalid payload' });

      records.forEach(({ studentId, status }) => {
        if (!['present', 'absent'].includes(status)) return;
        if (!cls.studentIds.includes(studentId)) return;
        const idx = db.attendance.findIndex(a => a.classId === classId && a.studentId === studentId && a.date === date);
        if (idx >= 0) {
          db.attendance[idx].status = status;
        } else {
          db.attendance.push({ id: 'a' + Date.now() + Math.floor(Math.random() * 1000), classId, date, studentId, status });
        }
      });
      writeDB(db);
      return sendJSON(res, 200, { success: true, message: 'Attendance saved' });
    }

    // class history: list of dates it's been held + attendance %
    if (pathname.match(/^\/api\/faculty\/class\/[^/]+\/history$/) && req.method === 'GET') {
      const classId = pathname.split('/')[4];
      const cls = db.classes.find(c => c.id === classId && c.facultyId === fac.id);
      if (!cls) return sendJSON(res, 404, { success: false, message: 'Class not found' });
      const recs = db.attendance.filter(a => a.classId === classId);
      const byDate = {};
      recs.forEach(r => {
        byDate[r.date] = byDate[r.date] || { date: r.date, present: 0, total: 0 };
        byDate[r.date].total++;
        if (r.status === 'present') byDate[r.date].present++;
      });
      const history = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      return sendJSON(res, 200, { success: true, history });
    }

    return sendJSON(res, 404, { success: false, message: 'Not found' });
  }

  return sendJSON(res, 400, { success: false, message: 'Unknown role' });
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, parsed.query);
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { success: false, message: 'Server error' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Attendance system running at http://localhost:${PORT}`);
});
