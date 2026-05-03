alter table public.games
  add column if not exists steam_developer text,
  add column if not exists steam_publisher text,
  add column if not exists steam_base_price text,
  add column if not exists steam_review_score_percent numeric(5, 2);

alter table public.games
  add constraint games_steam_review_score_percent_range
  check (steam_review_score_percent is null or (steam_review_score_percent >= 0 and steam_review_score_percent <= 100))
  not valid;

alter table public.games validate constraint games_steam_review_score_percent_range;
