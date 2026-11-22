-- Keep user_books.updated_at current on every update.
-- Until now nothing maintained it (the legacy app never set it), so it always
-- equalled created_at. The Next.js app keys forms on it to show values the
-- server derives after a save.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger-only function: nobody needs to call it directly.
revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists user_books_set_updated_at on public.user_books;
create trigger user_books_set_updated_at
  before update on public.user_books
  for each row execute function public.set_updated_at();
