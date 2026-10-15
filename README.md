# AIGOAL Intranet

React + Vite + TypeScript front-end on Supabase (email + password login, Postgres with row-level security).

## One-time setup

1. **Database** – Supabase dashboard → SQL Editor → run every file in `supabase/migrations/` in order (001 → 017).
   (Seeds the Sales KPI template from the Winson sheet and the Useful Link / Onboarding knowledge base.)
2. **Auth** – Authentication → Providers → Email: keep enabled, turn **off** "Allow new users to sign up"
   (accounts are created by Admin/HR inside the app).
3. **Edge function** (create users / reset passwords):
   `supabase functions deploy admin-users --project-ref aaonpprtgitydcgptnlh`
4. **First admin** – Authentication → Users → *Add user* (email + password, auto-confirm). Then in SQL editor:
   `update public.profiles set role = 'admin', full_name = 'Your Name' where email = 'you@aigoal.ai';`
5. **Env** – `cp .env.example .env`, paste the project's *anon public* key into `VITE_SUPABASE_ANON_KEY`.
6. `npm install && npm run dev` (build: `npm run build`, output in `dist/`; uses hash routing so any static host works).

## Passwords

New users, and anyone whose password Admin/HR resets, must choose their own password at their next login before they can
use the app. Admin/HR hand out a temporary password in People; the user replaces it on first sign-in.

## Who sees what

- **Purchase Accounts and Follow-Up Customers are per person.** Each login sees only the accounts/leads assigned to them;
  Admin sees everything and assigns owners (the "Assigned to" field). Records are linked to a login by name
  (e.g. owner "Winson" -> the profile named "Winson"). Staff cannot reassign or delete records.
- **Audit Log.** Every change to an account or customer is recorded by the database itself (who, when, old value, new value,
  also deletes). People see the history of their own records inside the edit form; Admin sees the full log under Audit Log.
- Tables are paginated (10/25/50/100 rows).
- Admin can change a person's login email under People.

## Onboarding times (from the AIGOAL calendar)

Onboarding 1 / 2 / 3 dates are **read-only** in the intranet; they are pulled from the AIGOAL calendar
(`/api/calendar/appointments`): service "AIGOAL Onboarding" = Onboarding 1, "AIGOAL 2nd Round Onboarding" = Onboarding 2,
a 3rd-round/final service = Onboarding 3. Admin clicks **Sync AIGOAL calendar** on Purchase Accounts and pastes a fresh
AIGOAL API token (it expires in about an hour and is not stored). Bookings are matched to accounts by phone, then email.
Deploy once with `supabase functions deploy sync-onboarding`. Set the function secret `AIGOAL_API_TOKEN` to a long-lived
key if AIGOAL offers one, to sync without pasting a token.

## Onboarding flow

Purchase Accounts follow one flow: **Onboarding 1 > Develop > Develop Done > Onboarding 2 > Onboarding 3**. Onboarding 1/2/3
come from the AIGOAL calendar (services "AIGOAL Onboarding", "AIGOAL 2nd Round Onboarding", "AIGOAL Onboarding 3");
**Develop** and **Develop Done** are one-click buttons (only the account's owner or Admin; time and person are recorded by the
server and appear in the change history; Admin can undo). Accounts imported from the old sheet use its chatbot / landing page /
optimised records as develop progress.

## Calendar and leave

- Month calendar with Malaysia public holidays (national + Kuala Lumpur & Selangor, 2026–2027, editable by Admin under
  Calendar & Leave > Holidays, since Islamic holiday dates can shift), plus everyone's approved leave/travel and meetings.
- **Leave:** 8 days per person per year by default. Staff apply for annual leave or business travel; Admin/HR approve or
  reject. Days are counted by the server (weekends and public holidays are skipped, half days allowed); requests that
  exceed the remaining balance or overlap another request are refused. Travel does not use leave.
- **Admin/HR can set entitlement** per person or for everyone at once (Leave balances tab); the same number becomes the
  default for new staff. Reasons stay private: the team calendar only shows who is away.

## Access and job roles

Access level: **Admin** (everything), **HR** (+ Calendar & Leave approvals, People), **Staff** (everyone else). On top, People has
**job roles** that can be combined: **Sales** and **AI Builder**. They feed the dropdowns (Assigned sales / Sales / Closed via list
Sales people; AI Builder 1 / 2 and the Remind menu list AI Builders).

Menu for non-admin: Home, To-Do, PDR/KPI, Meeting Minutes, Purchase Accounts, Follow-Up Customers (profile via the name at the bottom).
- **Purchase Accounts:** everyone sees every account; only the account's **AI Builder** (or Admin) can edit it, click Develop /
  Develop Done, or change its customer details (company, name, phone, email, industry, category, purchase date). AI Builders,
  Sales and Closed-via are set by Admin only. Anyone can add follow-ups and **Remind** an AI Builder, which marks the account
  "Pending <name>" and shows on their menu badge and dashboard.
- **Follow-Up Customers:** each sales person sees only the leads assigned to them; priority, assigned sales, webinar, name,
  phone and email are locked (Admin only). Status: Pending Management (remark required) / Pending Demo / Invite Webinar.
  A webinar's leads appear the day after it happens (21 Oct shows from 22 Oct).
- **Admin dashboard (Home):** what needs attention plus every staff member's status.

## Roles (original table)

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

## Data imported

- **Purchase Accounts** – the first tab of the GHL Subscription Report (44 customers).
- **Follow-Up Customers** – Winson's and Aaron's webinar lead sheets, all weekly tabs plus Aaron's Inbox (951 leads).
  Each lead stores its sales person's name (`owner_name`). As soon as a staff profile with a matching name is
  created in People (e.g. "Winson Tan", "Aaron Lim"), that person's leads are linked to them automatically and they
  see only those leads.

- **app.aigoal.ai link** – leads from the `webinar-2026-09-16` … `webinar-2026-10-21` tags of the AIGOAL.ai tenant
  (`/api/contacts/list`) were matched by phone/email per webinar: 809 linked, 47 new (mostly the 21 Oct webinar).
  Each lead keeps its app contact id, tags and status. Status `won` (or tag `purchased`) shows a green **Purchased** tag
  in Follow-Up Customers (filterable). Existing priorities and sales owners were not changed; new leads start at P4.

## UI conventions

Icons are `lucide-react` (no emoji). One shared `Select`, `DatePicker` and `NumberInput` (plain text input, no spinner)
live in `src/components/ui.tsx` and are used on every page.

## Extras added beyond the brief

Quick-links home page with pinned KB items, today's to-do progress, month overview (总览) of PDR income,
CSV import for purchase accounts and customers (export tabs from Google Sheets as CSV), WhatsApp click-to-chat on
customer phones, copy-to-clipboard for scripts, move-task-to-tomorrow, finalise/lock a month's scorecard.
