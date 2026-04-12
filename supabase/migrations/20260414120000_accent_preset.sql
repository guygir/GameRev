-- Dark review leading accent: NULL = derive from slug hash; 0–4 = fixed presets (see /addgame).
alter table public.games add column if not exists accent_preset smallint;
