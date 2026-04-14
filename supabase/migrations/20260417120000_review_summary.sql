-- Optional capsule summary for the public review page (`games.summary`).

alter table public.games
  add column if not exists summary text;

comment on column public.games.summary is 'Optional editorial summary; shown in the review page Summary fold.';
