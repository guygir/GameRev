-- If the database was created from an older `init` only, add-game expects these columns.
alter table public.games add column if not exists platforms text[] not null default '{}';
alter table public.games add column if not exists release_label text;
