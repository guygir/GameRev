-- Grayscale accent for B&W / low-color covers: 0 = darker neutrals, 100 = lighter neutrals.
-- When set, `accent_hue` should be null (chromatic accent disabled for that row).
alter table public.games
  add column if not exists accent_gray_level smallint;

alter table public.games
  drop constraint if exists games_accent_gray_level_range;

alter table public.games
  add constraint games_accent_gray_level_range
  check (accent_gray_level is null or (accent_gray_level >= 0 and accent_gray_level <= 100));
