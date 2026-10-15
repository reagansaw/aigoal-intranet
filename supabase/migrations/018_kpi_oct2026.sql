
alter table public.kpi_templates add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.kpi_templates add column if not exists indicators jsonb not null default '[]'::jsonb;
alter table public.kpi_templates add column if not exists daily_tasks jsonb not null default '[]'::jsonb;
alter table public.kpi_templates add column if not exists max_over_bonus numeric;
alter table public.kpi_items add column if not exists note text;
alter table public.kpi_items add column if not exists source text not null default 'manual';
alter table public.kpi_items add column if not exists bonus_needs_budget boolean not null default false;
do $$ begin alter table public.kpi_items add constraint kpi_items_source_chk check (source in ('manual','attendance','leadmagnet','cpl','checklist')); exception when duplicate_object then null; end $$;
alter table public.kpi_reviews add column if not exists extra_note text;
alter table public.kpi_reviews add column if not exists indicators jsonb not null default '[]'::jsonb;
alter table public.kpi_reviews add column if not exists daily jsonb not null default '[]'::jsonb;

create table if not exists public.kpi_weekly (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.kpi_reviews(id) on delete cascade,
  sort int not null default 0, week_date date,
  ad_budget numeric, attendance_target numeric, leadmagnet_target numeric,
  attendance_actual numeric, leadmagnet_actual numeric, ad_spend numeric, leads_total numeric);
create table if not exists public.kpi_checklist (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.kpi_reviews(id) on delete cascade,
  sort int not null default 0, item text not null, requirement text,
  status text check (status in ('完成','未完成','不适用')), evidence text);
create table if not exists public.kpi_orders (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.kpi_reviews(id) on delete cascade,
  sort int not null default 0, customer_ref text, source_webinar text, first_payment_date date,
  net_received numeric not null default 0, is_commission_order boolean not null default false);
create index if not exists kpi_weekly_review_idx on public.kpi_weekly (review_id, sort);
create index if not exists kpi_checklist_review_idx on public.kpi_checklist (review_id, sort);
create index if not exists kpi_orders_review_idx on public.kpi_orders (review_id, sort);

do $$ declare t text; begin
  foreach t in array array['kpi_weekly','kpi_checklist','kpi_orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s read" on public.%1$I', t);
    execute format('drop policy if exists "%1$s write" on public.%1$I', t);
    execute format($p$create policy "%1$s read" on public.%1$I for select to authenticated using (exists (select 1 from public.kpi_reviews r where r.id = review_id and (r.user_id = auth.uid() or public.is_admin_or_hr())))$p$, t);
    execute format($p$create policy "%1$s write" on public.%1$I for all to authenticated using (public.is_admin_or_hr()) with check (public.is_admin_or_hr())$p$, t);
  end loop; end $$;

-- Template = the Oct 2026 Winson sheet, exactly
update public.kpi_templates set
  description = $d$• 固定服务费 RM3,000/月；基础绩效 = 基础总分 × RM15，最高 RM1,500。
• 基础五项：出席人数25分、Lead Magnet 15分、广告CPL 20分、Checklist 10分、Full Script 30分（附件A）。
• 营销超额奖励（附件B）：基础分≥80，出席≥130%（且未超预算）RM450；Lead Magnet≥130% RM450；最高 RM900。
• 销售佣金（附件C）：每月第1–3单不计，第4单起按实际净收款10%，独立另计，无80分门槛。
• 各月份分页中，黄色格为需要填写的项目；总览页自动汇总。$d$, max_over_bonus = 900,
  checklist = $j$[{"item": "原创内容", "requirement": "至少 10 项（同步 FB 及 IG 不重复计数）", "evidence": "发布链接及源文件："}, {"item": "Story 及 Page", "requirement": "Story 转发及活动提醒；每周 Post 排期", "evidence": "链接或后台记录："}, {"item": "节庆或季节营销", "requirement": "内容及发送计划（不适用须注明）", "evidence": "素材及发送记录："}, {"item": "Banner 及车身物料", "requirement": "适用设计；更新或交付时间", "evidence": "文件及交付记录："}, {"item": "Sales Kit 及封面", "requirement": "产品资料及视觉更新", "evidence": "最终及编辑文件："}, {"item": "Landing Page 及 Funnel", "requirement": "改版文案；检查及优化项目", "evidence": "页面及测试记录："}, {"item": "Automation", "requirement": "领取、确认、提醒、分发及跟进", "evidence": "配置及测试记录："}, {"item": "广告及出席执行", "requirement": "素材测试；投放及提醒安排", "evidence": "后台及出席报告："}, {"item": "销售跟进", "requirement": "当晚追单、Demo、收款及状态", "evidence": "CRM 及收款记录："}, {"item": "报告与方向复盘", "requirement": "每日简报、每周总结、每两周方向", "evidence": "报告及会议记录："}]$j$::jsonb,
  indicators = $j$["没有主动收到任何新的见证好评"]$j$::jsonb,
  daily_tasks = $j$["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]$j$::jsonb
where name = 'Marketing / Sales KPI (Winson)';

with t as (select id from public.kpi_templates where name = 'Marketing / Sales KPI (Winson)')
update public.kpi_items i set
  name = v.name, standard = v.standard, max_points = v.max, unit = v.unit, direction = v.dir, pct_of_target = v.pct, bands = v.bands::jsonb,
  target = v.target, note = v.note, source = v.src, bonus_threshold_pct = v.bt, bonus_amount = v.ba, bonus_needs_budget = v.nb
from t, (values
 (1,'分享会有效出席人数', E'达成率≥100%: 25\n95%：20; 90%：15；\n85%：10；80%：5；低于80%：0', 25, 'pax','higher',true,'[{"threshold":100,"points":25},{"threshold":95,"points":20},{"threshold":90,"points":15},{"threshold":85,"points":10},{"threshold":80,"points":5}]', null::numeric,'This Month: 300','attendance',130,450,true),
 (2,'自然流量 Lead Magnet（目标100人）', E'≥91人：15\n81–90人：10；71–80人：5；\n70人：3；少于70人：0', 15, 'leads','higher',false,'[{"threshold":91,"points":15},{"threshold":81,"points":10},{"threshold":71,"points":5},{"threshold":70,"points":3}]', 100::numeric,'This Month: 50','leadmagnet',130,450,false),
 (3,'广告 CPL（目标 ≤ RM30）', E'低于RM35：20；\nRM35–<40：15；RM40–<45：10；\n恰好RM45：5；超过RM45：0', 20, 'RM','lower',false,'[{"threshold":34.99,"points":20},{"threshold":39.99,"points":15},{"threshold":44.99,"points":10},{"threshold":45,"points":5}]', 30::numeric,null,'cpl',null::numeric,null::numeric,false),
 (4,'Marketing Strategy Checklist', E'所有到期任务按时完成并达标：10；\n任何一项未完成/逾期/未达标：0', 10, null,'manual',false,'[]', null::numeric,'Max for this month put 10','checklist',null::numeric,null::numeric,false),
 (5,'Full Script (Call Journey)', '80 Full Script', 30, null,'manual',false,'[]', 80::numeric,'This month : 40 Full Script','manual',null::numeric,null::numeric,false)
) as v(sort,name,standard,max,unit,dir,pct,bands,target,note,src,bt,ba,nb)
where i.template_id = t.id and i.sort = v.sort;
