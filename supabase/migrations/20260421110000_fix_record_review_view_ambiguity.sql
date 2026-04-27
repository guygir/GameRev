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
    set view_count = public.games.view_count + 1
    where public.games.id = v_game_id;
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
