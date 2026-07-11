# EduTrack — Student Attendance Management System

A full-stack attendance system built with plain **HTML, CSS, and JavaScript**
on the frontend, and a **pure Node.js** backend (no npm packages required —
only built-in `http`, `fs`, `crypto` modules).

## Features

**Faculty login**
- View all assigned classes, with a badge for classes happening today
- **Create their own classes** — name, subject, and a custom weekly schedule
  (add as many day/time slots as needed)
- **View every student in the system and manage who's enrolled** in each of
  their classes (checkbox roster, with each enrolled student's attendance %
  for that specific class shown alongside)
- Mark attendance for any class/date (Present / Absent per student)
- "Mark All Present" / "Mark All Absent" bulk actions
- Attendance can be re-opened and corrected for a given date

**Student login**
- Cannot mark their own attendance (view-only, by design)
- Daily / Weekly / Monthly / Yearly attendance percentage rings
- Attendance history table, filterable by period
- Per-subject attendance breakdown with progress bars
- "Today's Classes" list showing what's left to attend and whether it's
  already been marked
- Full weekly timetable of upcoming classes

## Project structure

```
attendance-system/
├── server.js        # Backend: HTTP server + REST API (no dependencies)
├── seed.js           # Generates demo data (run once, or re-run to reset)
├── data/
│   └── db.json        # "Database" — plain JSON file
├── public/
│   ├── index.html      # Single-page app markup (login + both dashboards)
│   ├── css/style.css    # All styling
│   └── js/app.js        # All frontend logic (fetch calls, rendering)
└── README.md
```

## Running it

Requires only Node.js (v14+). No `npm install` needed.

```bash
cd attendance-system
node server.js
```

Then open **http://localhost:3000** in your browser.

To reset the demo data at any time (regenerates 90 days of realistic
attendance history):

```bash
node seed.js
```

## Demo accounts

| Role    | Username    | Password  |
|---------|-------------|-----------|
| Student | student1    | pass123   |
| Student | student2    | pass123   |
| Faculty | faculty1    | pass123   |
| Faculty | faculty2    | pass123   |

(6 students total: student1–student6; 3 faculty: faculty1–faculty3 — see
`seed.js` for the full roster and class assignments.)

## How the backend works

- `data/db.json` holds `faculty`, `students`, `classes`, and `attendance`
  arrays. It's read fresh on each request and rewritten whenever attendance
  is marked, so it survives server restarts.
- Login issues a random token that's kept in an in-memory session map on
  the server; the frontend stores it in `localStorage` and sends it as
  `Authorization: Bearer <token>` on every request after that.
- Route protection is role-based: student endpoints live under
  `/api/student/*` and only work with a student session; faculty endpoints
  live under `/api/faculty/*` and only work with a faculty session. There
  is intentionally no endpoint that lets a student write attendance data.

## Notes on moving this to production

This is built to be easy to read and run anywhere, so a few things are
simplified on purpose:

- Passwords are stored in plain text in `db.json`. For real use, hash them
  (e.g. with `crypto.scrypt` or `bcrypt`) before storing.
- Sessions are in-memory, so they reset if the server restarts. For real
  use, consider signed cookies/JWTs or a persistent session store.
- `db.json` is a flat file, fine for a class project or small deployment.
  For anything larger, swap the `readDB`/`writeDB` functions in
  `server.js` for a real database (SQLite/Postgres/etc.) — the rest of
  the API logic can stay the same.
