-- Manual catalog order for home "Sort by rank". Lower rank = earlier in list (1 = first).

alter table public.games add column if not exists catalog_rank integer;

update public.games g
set catalog_rank = o.rn
from (
  select id, row_number() over (order by created_at desc) as rn
  from public.games
) o
where g.id = o.id and g.catalog_rank is null;

alter table public.games alter column catalog_rank set not null;

create unique index if not exists games_catalog_rank_uidx on public.games (catalog_rank);
