-- Add storefront-style platforms to each review (separate from genre taxonomy).
alter table public.games
  add column if not exists platforms text[] not null default '{}';
