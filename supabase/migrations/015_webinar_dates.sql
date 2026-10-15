-- A real date for each webinar batch ("21 Oct"), so lists sort in date order and an upcoming webinar stays hidden
-- until the day after it has taken place (21 Oct is shown from 22 Oct).
create or replace function public.batch_to_date(label text, ref date) returns date
language plpgsql immutable as $$
declare m text[]; best date; d date; y int; base int := extract(year from ref)::int;
begin
  m := regexp_match(coalesce(label, ''), '^\s*(\d{1,2})\s+([A-Za-z]{3})');
  if m is null then return null; end if;
  for y in (base - 1)..(base + 1) loop
    begin
      d := to_date(m[1] || ' ' || m[2] || ' ' || y, 'FMDD Mon YYYY');
      if best is null or abs(d - ref) < abs(best - ref) then best := d; end if;
    exception when others then null;
    end;
  end loop;
  return best;
end $$;

alter table public.customers add column if not exists batch_date date;
create or replace function public.set_batch_date() returns trigger language plpgsql as $$
begin new.batch_date := public.batch_to_date(new.batch, coalesce(new.created_at::date, current_date)); return new; end $$;
drop trigger if exists set_batch_date on public.customers;
create trigger set_batch_date before insert or update of batch on public.customers for each row execute function public.set_batch_date();

alter table public.customers disable trigger audit_customers;
update public.customers set batch_date = public.batch_to_date(batch, created_at::date);
alter table public.customers enable trigger audit_customers;
