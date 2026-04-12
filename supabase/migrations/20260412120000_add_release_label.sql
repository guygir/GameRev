-- Optional display string from IGDB first_release_date (e.g. "October 2022").
alter table public.games add column if not exists release_label text;
