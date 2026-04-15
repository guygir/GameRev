-- GitHub issue per game (reader comments mirrored as issue comments).
-- Steam storefront-derived popularity for semicircle gauge (filled at publish time from editor).

alter table public.games
  add column if not exists github_issue_number integer,
  add column if not exists steam_app_id integer,
  add column if not exists steam_review_count integer,
  add column if not exists visibility_score real;

comment on column public.games.github_issue_number is 'GitHub issue # for mirrored reader comments; set on first sync.';
comment on column public.games.steam_app_id is 'Steam store app id chosen at publish time (store search).';
comment on column public.games.steam_review_count is 'Steam total_reviews snapshot at publish time.';
comment on column public.games.visibility_score is '0–1 popularity needle (Steam reviews + release-year tweak).';
