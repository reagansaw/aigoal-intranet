-- AIGOAL Intranet schema. Run in Supabase SQL editor (or `supabase db push`).

create type user_role as enum ('admin', 'hr', 'staff');

-- ───────────── profiles ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  email text,
  title text,
  gender text check (gender in ('Male', 'Female', 'Other')),
  employment_type text check (employment_type in ('Full-time', 'Part-time', 'Contract', 'Freelance/Partner', 'Intern')),
  start_date date,
  end_date date,
  role user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() = 'admin', false) $$;

create or replace function public.is_admin_or_hr() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() in ('admin', 'hr'), false) $$;

-- Auto-create a profile for every new auth user (role defaults to staff)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Staff may edit their own contact details but never role / active / employment period
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / SQL editor: unrestricted
  if not public.is_admin_or_hr() then
    new.role := old.role;
    new.active := old.active;
    new.employment_type := old.employment_type;
    new.start_date := old.start_date;
    new.end_date := old.end_date;
    new.title := old.title;
  elsif public.current_role_name() = 'hr' then
    new.role := old.role; -- only admin can change roles
  end if;
  return new;
end $$;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update self or hr" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin_or_hr());

-- ───────────── todos ─────────────
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  notes text,
  due_date date not null default current_date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.todos (user_id, due_date);
alter table public.todos enable row level security;
create policy "todos own or manager" on public.todos for all to authenticated
  using (user_id = auth.uid() or public.is_admin_or_hr())
  with check (user_id = auth.uid() or public.is_admin_or_hr());

-- ───────────── KPI (PDR) templates ─────────────
-- One template = one scorecard (e.g. "Marketing KPI", "Sales KPI"). Fully editable by admin.
create table public.kpi_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  base_fee numeric not null default 0,            -- fixed monthly service fee / salary
  currency text not null default 'RM',
  rate_per_point numeric not null default 0,      -- bonus per base point
  max_base_bonus numeric,                         -- cap on base performance bonus
  qualify_score numeric not null default 80,      -- min base score to unlock over-achievement bonus
  commission_rate numeric not null default 0,     -- e.g. 0.10
  commission_free_deals int not null default 0,   -- first N deals each month earn no commission
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Scorecard rows. `bands` lets scoring be automatic:
--   direction 'higher': first band (sorted by threshold desc) where achieved >= threshold wins
--   direction 'lower' : first band (sorted by threshold asc)  where achieved <= threshold wins
--   bands = [{"threshold": 100, "points": 25}, ...]. `pct_of_target` = threshold is % of target.
create table public.kpi_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.kpi_templates(id) on delete cascade,
  sort int not null default 0,
  name text not null,
  standard text,                                  -- human readable scoring standard
  max_points numeric not null default 0,
  target numeric,
  unit text,                                      -- e.g. "pax", "RM", "leads"
  direction text not null default 'higher' check (direction in ('higher', 'lower', 'manual')),
  pct_of_target boolean not null default false,
  bands jsonb not null default '[]'::jsonb,
  bonus_threshold_pct numeric,                    -- over-achievement bonus: achieved >= x% of target
  bonus_amount numeric                            -- ... pays this amount
);
create index on public.kpi_items (template_id, sort);

-- A staff member's scorecard for one month
create table public.kpi_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.kpi_templates(id),
  month date not null,                            -- first day of the month
  deals_count int not null default 0,
  net_collected numeric not null default 0,       -- for commission
  summary text,                                   -- reviewer comment
  locked boolean not null default false,          -- finalised by HR/admin
  created_at timestamptz not null default now(),
  unique (user_id, month)
);
create table public.kpi_scores (
  review_id uuid not null references public.kpi_reviews(id) on delete cascade,
  item_id uuid not null references public.kpi_items(id) on delete cascade,
  actual numeric,
  score numeric,                                  -- null = auto calculate from bands
  reason text,
  improvement text,
  primary key (review_id, item_id)
);

alter table public.kpi_templates enable row level security;
alter table public.kpi_items enable row level security;
alter table public.kpi_reviews enable row level security;
alter table public.kpi_scores enable row level security;

create policy "tpl read" on public.kpi_templates for select to authenticated using (true);
create policy "tpl admin write" on public.kpi_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "items read" on public.kpi_items for select to authenticated using (true);
create policy "items admin write" on public.kpi_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "reviews read" on public.kpi_reviews for select to authenticated
  using (user_id = auth.uid() or public.is_admin_or_hr());
create policy "reviews write" on public.kpi_reviews for all to authenticated
  using (public.is_admin_or_hr()) with check (public.is_admin_or_hr());

create policy "scores read" on public.kpi_scores for select to authenticated
  using (exists (select 1 from public.kpi_reviews r where r.id = review_id and (r.user_id = auth.uid() or public.is_admin_or_hr())));
create policy "scores write" on public.kpi_scores for all to authenticated
  using (public.is_admin_or_hr()) with check (public.is_admin_or_hr());

-- ───────────── Purchase accounts (AIGOAL / QAI account list) ─────────────
create table public.purchase_accounts (
  id uuid primary key default gen_random_uuid(),
  product text not null default 'AIGOAL',          -- AIGOAL / QAI / AI Studio ...
  account_name text not null,                      -- GHL account name
  owner_user text,                                 -- "User" column (GT, ...)
  industry text,
  status text,                                     -- Active, 超过6个月没更新 ...
  new_status text,                                 -- Paused, Onhold, ...
  purchase_date date,
  expiry_date date,
  followup_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchase_accounts enable row level security;
create policy "accounts read" on public.purchase_accounts for select to authenticated using (true);
create policy "accounts write" on public.purchase_accounts for all to authenticated
  using (public.is_admin_or_hr() or public.current_role_name() = 'staff')
  with check (public.is_admin_or_hr() or public.current_role_name() = 'staff');

-- ───────────── Follow-up customers ─────────────
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,   -- assigned sales (负责 sales)
  batch text,                                      -- webinar tab e.g. "14 Oct"
  priority text not null default 'P4' check (priority in ('P1', 'P2', 'P3', 'P4')),
  name text not null,
  phone text,
  email text,
  industry text,
  repeat_from text,
  called boolean not null default false,
  not_available boolean not null default false,
  not_interested_reason text,
  team_size text,
  monthly_revenue text,
  daily_leads boolean,
  leads_per_day text,
  reply_method text,
  missed_leads text,
  channels text[] not null default '{}',
  other_courses text,
  result text,
  closed_date date,
  prospect boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customers (owner_id);
alter table public.customers enable row level security;
-- Admin sees the main list; staff only see rows assigned to them
create policy "customers admin all" on public.customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "customers staff own" on public.customers for select to authenticated
  using (owner_id = auth.uid());
create policy "customers staff update own" on public.customers for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Stops staff reassigning a lead or editing the admin-controlled fields
create or replace function public.guard_customer_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and not public.is_admin() then
    new.owner_id := old.owner_id;
    new.priority := old.priority;
    new.batch := old.batch;
  end if;
  return new;
end $$;
create trigger guard_customer_update before update on public.customers
  for each row execute function public.guard_customer_update();

-- ───────────── Knowledge base ─────────────
create table public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'General',        -- Useful Link, Onboarding, Scripts, E-Invoice ...
  title text not null,
  body text,                                       -- plain text / markdown-ish, copy-friendly
  url text,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.kb_articles enable row level security;
create policy "kb read" on public.kb_articles for select to authenticated using (true);
create policy "kb admin write" on public.kb_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────── Seed: Sales KPI template (from Winson KPI sheet) ─────────────
with t as (
  insert into public.kpi_templates (name, description, base_fee, rate_per_point, max_base_bonus, qualify_score, commission_rate, commission_free_deals)
  values ('Marketing / Sales KPI (Winson)', 'Base 100 pts × RM15 (max RM1,500). Over-achievement bonus needs base score ≥ 80. Commission 10% from the 4th deal.', 3000, 15, 1500, 80, 0.10, 3)
  returning id
)
insert into public.kpi_items (template_id, sort, name, standard, max_points, target, unit, direction, pct_of_target, bands, bonus_threshold_pct, bonus_amount)
select t.id, v.sort, v.name, v.standard, v.max_points, v.target, v.unit, v.direction, v.pct, v.bands::jsonb, v.bt, v.ba from t,
(values
  (1, '分享会有效出席人数 (Webinar attendance)', 'Achievement ≥100%: 25 · 95%: 20 · 90%: 15 · 85%: 10 · 80%: 5 · below 80%: 0', 25, 232, 'pax', 'higher', true,
    '[{"threshold":100,"points":25},{"threshold":95,"points":20},{"threshold":90,"points":15},{"threshold":85,"points":10},{"threshold":80,"points":5}]', 130, 450),
  (2, '自然流量 Lead Magnet (Organic leads)', '≥91: 15 · 81–90: 10 · 71–80: 5 · 70: 3 · below 70: 0', 15, 100, 'leads', 'higher', false,
    '[{"threshold":91,"points":15},{"threshold":81,"points":10},{"threshold":71,"points":5},{"threshold":70,"points":3}]', 130, 450),
  (3, '广告 CPL (Ads cost per lead, target ≤ RM30)', '< RM35: 20 · 35–<40: 15 · 40–<45: 10 · exactly 45: 5 · above 45: 0', 20, 30, 'RM', 'lower', false,
    '[{"threshold":34.99,"points":20},{"threshold":39.99,"points":15},{"threshold":44.99,"points":10},{"threshold":45,"points":5}]', null, null),
  (4, 'Marketing Strategy Checklist', 'All due tasks done on time & to standard: 10 · any missing/late: 0', 10, null, null, 'manual', false, '[]', null, null),
  (5, 'Full Script (Call Journey)', 'Script completion — manual score', 30, 80, 'scripts', 'manual', false, '[]', null, null)
) as v(sort, name, standard, max_points, target, unit, direction, pct, bands, bt, ba);

-- Seed knowledge base from the shared "Useful Link" sheet
insert into public.kb_articles (category, title, url, pinned) values
  ('Useful Link', 'Onboarding Link', 'https://aigoal-ai-conversion-onboarding-131.aigoal.ai', true),
  ('Useful Link', 'AIGOAL App', 'https://app.aigoal.ai', true),
  ('Useful Link', 'AI Studio', 'https://studio.aigoal.ai/auth', true),
  ('Useful Link', 'AIGOAL Website', 'https://www.aigoal.ai', false),
  ('Useful Link', 'AIGOAL Intro Deck (Latest 4 Oct 2026)', 'https://drive.google.com/file/d/1jiY9-alLn3RyhW-sn9ExOdSy-TErPADP/view?usp=share_link', false),
  ('Useful Link', 'AIGOAL Collaboration Deck (Latest 2 Oct 2026)', 'https://docs.google.com/presentation/d/1Y2MivS_ZQgsFvhrLEKNMQUVNH7Udxvv_l7kWSeF5Wuw/edit', false),
  ('Useful Link', 'Webinar PPT', 'https://www.canva.com/design/DAHCThdMH4g/dan51zDuyDLU8HqYla6JzA/edit', false),
  ('Social', 'Facebook Page', 'https://www.facebook.com/profile.php?id=61556801645841', false),
  ('Social', 'Instagram Page', 'https://www.instagram.com/aigoal_ai', false),
  ('Social', 'LinkedIn Page', 'https://www.linkedin.com/company/aigoals141/', false);
insert into public.kb_articles (category, title, body) values
  ('Onboarding', 'Onboarding — 1st checklist',
E'1. Tell customer there are 3 Zoom onboarding sessions\n2. We build an AI Chatbot and 1 Landing Page\n3. Customer channel?\n4. Final objective to achieve with AIGOAL\n5. WhatsApp chat history & understand the FLOW\n6. Got testimonial (见证)?\n7. SLA 5 working days for Chatbot\n8. 2nd onboarding for Test & Demo — send calendar link to book'),
  ('Onboarding', 'WhatsApp — 1st message (VIP Support Group)',
E'🎉 *Welcome to our AIGOAL VIP Support Group！*🚀🤖\n\n这里的每一位，都是我们重视要客户 ❤️\n\n大家已经拥有我们的 两套 AI 系统，所以这个群就是为了让大家能够：\n💡 系统使用问题｜随时交流\n🛠️ 技术操作问题｜快速 Support\n🚀 新功能 / 新玩法｜第一时间分享\n\n我们的目标很简单：\n是要让你们把系统用起来、用好、用出结果！ 🔥\n\n*Let''s AI & Grow Together! *🚀'),
  ('Sales Flow', 'Webinar lead priority flow',
E'P1 🔥 热单 → Call\nP2 🟠 出席但看不久 → Call\nP3 🟡 没来但回过 YES → Automation blast\nP4 ⚪ 报名没回应 → Automation blast\n\nFollow-up order: message > voice > call > zoom');
