-- Engagement features: suggestion box support uses GitHub only; DB covers views, comment counts, and newsletter subscribers.

alter table public.games
  add column if not exists view_count integer not null default 0,
  add column if not exists comment_count integer not null default 0;

update public.games g
set comment_count = c.n
from (
  select game_id, count(*)::integer as n
  from public.comments
  group by game_id
) c
where g.id = c.game_id;

create or replace function public.bump_game_comment_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.games set comment_count = comment_count + 1 where id = new.game_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.games set comment_count = greatest(comment_count - 1, 0) where id = old.game_id;
    return old;
  elsif tg_op = 'UPDATE' and old.game_id is distinct from new.game_id then
    update public.games set comment_count = greatest(comment_count - 1, 0) where id = old.game_id;
    update public.games set comment_count = comment_count + 1 where id = new.game_id;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_bump_game_comment_count on public.comments;
create trigger comments_bump_game_comment_count
after insert or update of game_id or delete on public.comments
for each row execute function public.bump_game_comment_count();

create table if not exists public.review_views (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  visitor_key text not null,
  user_agent_hash text,
  view_day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  constraint review_views_visitor_key_len check (char_length(visitor_key) between 16 and 128)
);

create unique index if not exists review_views_game_visitor_day_idx
  on public.review_views (game_id, visitor_key, view_day);
create index if not exists review_views_game_created_at_idx
  on public.review_views (game_id, created_at desc);

alter table public.review_views enable row level security;
-- No public policies: inserts happen through the API with service role.

create or replace function public.record_review_view(
  p_slug text,
  p_visitor_key text,
  p_user_agent_hash text default null
)
returns table(view_count integer, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
  v_row_count integer := 0;
  v_inserted boolean := false;
begin
  select id into v_game_id
  from public.games
  where slug = trim(p_slug)
  limit 1;

  if v_game_id is null then
    raise exception 'review not found';
  end if;

  insert into public.review_views (game_id, visitor_key, user_agent_hash)
  values (v_game_id, trim(p_visitor_key), nullif(trim(coalesce(p_user_agent_hash, '')), ''))
  on conflict (game_id, visitor_key, view_day) do nothing;

  get diagnostics v_row_count = row_count;
  v_inserted := v_row_count > 0;

  if v_inserted then
    update public.games
    set view_count = view_count + 1
    where id = v_game_id;
  end if;

  return query
    select g.view_count, v_inserted
    from public.games g
    where g.id = v_game_id;
end;
$$;

revoke all on function public.record_review_view(text, text, text) from public;
revoke all on function public.record_review_view(text, text, text) from anon;
revoke all on function public.record_review_view(text, text, text) from authenticated;
grant execute on function public.record_review_view(text, text, text) to service_role;
