-- GameRev: games, genre/tag pools, anonymous comments.
-- Run in Supabase SQL editor or via supabase db push.

create extension if not exists pgcrypto;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subtitle text not null default '',
  cover_image_url text,
  hltb_main_hours real,
  hltb_extras_hours real,
  hltb_completionist_hours real,
  stats jsonb not null,
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  play_if_liked jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.genres (
  name text primary key
);

create table public.tags (
  name text primary key
);

create table public.game_genres (
  game_id uuid not null references public.games (id) on delete cascade,
  genre text not null references public.genres (name) on delete cascade,
  primary key (game_id, genre)
);

create table public.game_tags (
  game_id uuid not null references public.games (id) on delete cascade,
  tag text not null references public.tags (name) on delete cascade,
  primary key (game_id, tag)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  body text not null,
  author_name text,
  created_at timestamptz not null default now(),
  constraint comments_body_len check (char_length(body) between 1 and 4000)
);

create index comments_game_id_created_at_idx on public.comments (game_id, created_at desc);

alter table public.games enable row level security;
alter table public.genres enable row level security;
alter table public.tags enable row level security;
alter table public.game_genres enable row level security;
alter table public.game_tags enable row level security;
alter table public.comments enable row level security;

create policy games_select_public on public.games for select using (true);
create policy genres_select_public on public.genres for select using (true);
create policy tags_select_public on public.tags for select using (true);
create policy game_genres_select_public on public.game_genres for select using (true);
create policy game_tags_select_public on public.game_tags for select using (true);
create policy comments_select_public on public.comments for select using (true);
create policy comments_insert_public on public.comments for insert with check (true);

-- Writes to games / pools use the service role (server-side only).

insert into public.genres (name) values
  ('Survival horror'),
  ('Retro sci-fi'),
  ('Puzzle-adventure')
on conflict (name) do nothing;

insert into public.tags (name) values
  ('PS1 aesthetic'),
  ('Atmospheric'),
  ('Inventory puzzles'),
  ('Fixed camera')
on conflict (name) do nothing;
