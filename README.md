# Celestile-TaskManager

Next.js 14 (App Router) based task manager with Dashboard, Masters, and FMS Master views.

## Features

- **Dashboard** — Total / Completed / Pending stats, pending tasks list, `+ Add FMS` button
- **Masters** — All checklist tasks (Daily / Weekly / Monthly / One-time)
- **FMS Master** — Step-by-step campaign workflow tracking (8 steps per client). Click any pending status badge to mark it done.

## Tech Stack

- Next.js 14 (App Router, Server Components)
- React 18
- Tailwind CSS
- File-based JSON storage (`data/store.json`) — no database needed

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Run dev server
npm run dev

# 3. Open http://localhost:3000
```

## Production Build

```bash
npm run build
npm run start
```

## Data Storage

All data is stored in `data/store.json` which is auto-created on first run. To reset, just delete the file.

For production with multiple users, replace `lib/store.js` with a real database (Postgres, MongoDB, Supabase, etc.) — the API routes stay the same.

## Customize FMS Steps

Edit the `FMS_STEPS` array in `lib/store.js` to change step names, owners, or add/remove steps.

## Folder Structure

```
Celestile-TaskManager/
├── app/
│   ├── api/                # API routes
│   │   ├── dashboard/      
│   │   ├── fms/            # POST creates entry, /step marks done
│   │   └── masters/
│   ├── components/         # Sidebar, modals
│   ├── fms/                # FMS Master page
│   ├── masters/            # Masters page
│   ├── DashboardClient.jsx
│   ├── page.jsx            # Dashboard (home)
│   ├── layout.jsx
│   └── globals.css
├── lib/
│   └── store.js            # JSON file storage + helpers
├── data/
│   └── store.json          # Auto-generated
└── package.json
```
