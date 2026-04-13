-- Explicit dark accent hue (0–359). When set, overrides slug hash. Replaces reliance on five presets for saved reviews.
alter table public.games add column if not exists accent_hue smallint;

-- Backfill from legacy accent_preset (0–4) when hue not set.
update public.games
set accent_hue = (array[38, 198, 268, 145, 328]::smallint[])[accent_preset + 1]
where accent_preset is not null
  and accent_preset between 0 and 4
  and accent_hue is null;

