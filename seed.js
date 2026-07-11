// seed.js — generates data/db.json with demo faculty, students, classes and
// 90 days of realistic attendance history so the dashboards have something to show.
const fs = require('fs');
const path = require('path');

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const faculty = [
  { id: 'f1', username: 'faculty1', password: 'pass123', name: 'Dr. Sarah Johnson', department: 'Computer Science' },
  { id: 'f2', username: 'faculty2', password: 'pass123', name: 'Prof. Michael Chen', department: 'Mathematics' },
  { id: 'f3', username: 'faculty3', password: 'pass123', name: 'Dr. Emily Davis', department: 'Physics' },
];

const students = [
  { id: 's1', username: 'student1', password: 'pass123', name: 'Aarav Sharma', rollNo: 'CS101' },
  { id: 's2', username: 'student2', password: 'pass123', name: 'Diya Patel', rollNo: 'CS102' },
  { id: 's3', username: 'student3', password: 'pass123', name: 'Kabir Singh', rollNo: 'CS103' },
  { id: 's4', username: 'student4', password: 'pass123', name: 'Ananya Gupta', rollNo: 'CS104' },
  { id: 's5', username: 'student5', password: 'pass123', name: 'Vihaan Reddy', rollNo: 'CS105' },
  { id: 's6', username: 'student6', password: 'pass123', name: 'Ishita Kumar', rollNo: 'CS106' },
];

const allStudentIds = students.map(s => s.id);

const classes = [
  { id: 'c1', name: 'Data Structures', subject: 'CS201', facultyId: 'f1',
    schedule: [ { day: 'Monday', time: '09:00-10:00' }, { day: 'Wednesday', time: '09:00-10:00' }, { day: 'Friday', time: '09:00-10:00' } ],
    studentIds: allStudentIds },
  { id: 'c2', name: 'Discrete Mathematics', subject: 'MA204', facultyId: 'f2',
    schedule: [ { day: 'Tuesday', time: '10:15-11:15' }, { day: 'Thursday', time: '10:15-11:15' } ],
    studentIds: allStudentIds },
  { id: 'c3', name: 'Physics Lab', subject: 'PH150', facultyId: 'f3',
    schedule: [ { day: 'Monday', time: '13:00-15:00' } ],
    studentIds: ['s1','s2','s3','s4'] },
  { id: 'c4', name: 'Algorithms', subject: 'CS301', facultyId: 'f1',
    schedule: [ { day: 'Tuesday', time: '09:00-10:00' }, { day: 'Friday', time: '11:30-12:30' } ],
    studentIds: allStudentIds },
];

students.forEach(s => {
  s.classIds = classes.filter(c => c.studentIds.includes(s.id)).map(c => c.id);
});

// ---- Generate attendance history for the past ~90 days ----
const attendance = [];
let attId = 1;
const today = new Date('2026-07-11T00:00:00');
const DAYS_BACK = 90;

// give each student a slightly different "reliability" so charts look natural
const reliability = { s1: 0.95, s2: 0.88, s3: 0.7, s4: 0.92, s5: 0.6, s6: 0.83 };

for (let i = DAYS_BACK; i >= 1; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  const dayName = DAY_NAMES[d.getDay()];
  const dateStr = d.toISOString().slice(0, 10);

  classes.forEach(cls => {
    const hasClassToday = cls.schedule.some(sch => sch.day === dayName);
    if (!hasClassToday) return;
    cls.studentIds.forEach(sid => {
      const p = reliability[sid] ?? 0.8;
      const status = Math.random() < p ? 'present' : 'absent';
      attendance.push({ id: 'a' + (attId++), classId: cls.id, date: dateStr, studentId: sid, status });
    });
  });
}

const db = { faculty, students, classes, attendance };

fs.writeFileSync(path.join(__dirname, 'data', 'db.json'), JSON.stringify(db, null, 2));
console.log(`Seed complete: ${faculty.length} faculty, ${students.length} students, ${classes.length} classes, ${attendance.length} attendance records.`);
