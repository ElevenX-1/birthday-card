-- 生日贺卡留言表
-- 在 Supabase Dashboard → SQL Editor 中新建查询，粘贴并运行。

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null default '匿名旅人'
    check (char_length(name) between 1 and 16),
  text text not null
    check (char_length(text) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx
  on public.messages (created_at);

alter table public.messages enable row level security;

-- 所有访客都可以读
drop policy if exists "messages_public_read" on public.messages;
create policy "messages_public_read"
  on public.messages
  for select
  to anon, authenticated
  using (true);

-- 所有访客都可以留言，但不能改/删别人的留言
drop policy if exists "messages_public_insert" on public.messages;
create policy "messages_public_insert"
  on public.messages
  for insert
  to anon, authenticated
  with check (true);

revoke update, delete on public.messages from anon, authenticated;
grant select, insert on public.messages to anon, authenticated;
