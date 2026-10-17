-- Knowledge Base: Admin or Manager add and edit; everyone else reads only
drop policy if exists "kb admin write" on public.kb_articles;
create policy "kb admin write" on public.kb_articles for all to authenticated using (public.can_manage_crm()) with check (public.can_manage_crm());
