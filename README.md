# AIGOAL Intranet

React + Vite + TypeScript front-end on Supabase (email + password login, Postgres with row-level security).

## One-time setup

1. **Database** – Supabase dashboard → SQL Editor → paste and run `supabase/migrations/001_init.sql`.
   (Seeds the Sales KPI template from the Winson sheet and the Useful Link / Onboarding knowledge base.)
2. **Auth** – Authentication → Providers → Email: keep enabled, turn **off** "Allow new users to sign up"
   (accounts are created by Admin/HR inside the app).
3. **Edge function** (create users / reset passwords):
   `supabase functions deploy admin-users --project-ref aaonpprtgitydcgptnlh`
4. **First admin** – Authentication → Users → *Add user* (email + password, auto-confirm). Then in SQL editor:
   `update public.profiles set role = 'admin', full_name = 'Your Name' where email = 'you@aigoal.ai';`
5. **Env** – `cp .env.example .env`, paste the project's *anon public* key into `VITE_SUPABASE_ANON_KEY`.
6. `npm install && npm run dev` (build: `npm run build`, output in `dist/`; uses hash routing so any static host works).

## Roles

| | Admin | HR | Staff |
|---|---|---|---|
| Own profile, to-do, view own PDR | ✅ | ✅ | ✅ |
| People: add staff, edit employment info, reset password | ✅ (can set roles) | ✅ (staff only) | – |
| Create/score monthly PDR scorecards, see everyone's | ✅ | ✅ | own only (read-only) |
| Design KPI templates | ✅ | – | – |
| Purchase account list | ✅ | ✅ | ✅ (view/edit) |
| Follow-up customers | all (main list) | – | only rows assigned to them |
| Knowledge base | add/edit/pin | read | read |

## PDR / KPI template model

A template has a fixed fee, bonus per base point (+ cap), a qualifying score, optional commission, and scorecard rows.
Each row can score automatically from the actual figure via **bands** (`100:25, 95:20, …`, higher- or lower-is-better,
optionally as % of target) or manually; over-achievement bonuses are per row (e.g. ≥130% of target → RM450).
This reproduces the Winson sheet; build a Sales KPI template by duplicating it and editing the rows.

## Extras added beyond the brief

Quick-links home page with pinned KB items, today's to-do progress, month overview (总览) of PDR income,
CSV import for purchase accounts and customers (export tabs from Google Sheets as CSV), WhatsApp click-to-chat on
customer phones, copy-to-clipboard for scripts, move-task-to-tomorrow, finalise/lock a month's scorecard.
