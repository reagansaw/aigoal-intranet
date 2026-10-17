-- Only Admin deletes Knowledge Base articles; Admin, HR and Manager still add and edit them.
drop policy if exists "kb admin write" on public.kb_articles;
create policy "kb editors insert" on public.kb_articles for insert to authenticated with check (public.can_edit_kb());
create policy "kb editors update" on public.kb_articles for update to authenticated using (public.can_edit_kb()) with check (public.can_edit_kb());
create policy "kb admin delete" on public.kb_articles for delete to authenticated using (public.is_admin());
