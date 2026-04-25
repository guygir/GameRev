-- Optional one-liner shown in multiple spots on the public review (`games.editor_note`).

alter table public.games
  add column if not exists editor_note text;

comment on column public.games.editor_note is 'Optional informal kicker; repeated on the review under Editor''s note, The bottom line, and under Summary.';
