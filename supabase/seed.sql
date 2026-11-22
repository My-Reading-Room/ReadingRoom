-- LOCAL DEVELOPMENT SEED ONLY. Applied by `supabase db reset` / `supabase start`
-- to the local Docker stack; never run against a hosted project.
--
-- Three readers, mirroring how sharing works in production:
--   reader@example.test   you          (sign in with this one)
--   partner@example.test  shares a FULL profile with you
--   friend@example.test   shares a SUMMARY-only profile with you
-- Password for all three: reading-room-local
--
-- Books and sessions come from the legacy app's demo data (legacy/db.js).

-- ---------------------------------------------------------------------------
-- Users (auth.users + email identities; the on_auth_reader_created trigger
-- creates each profiles row from display_name)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('reading-room-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name),
  now() - interval '400 days', now(), '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'reader@example.test',  'Local Reader'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'partner@example.test', 'Reading Partner'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'friend@example.test',  'Book-club Friend')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u
where u.email like '%@example.test';

update public.profiles set tracking_start_date = date_trunc('year', current_date)::date
where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333');

-- ---------------------------------------------------------------------------
-- Sharing: partner → you (full), friend → you (summary)
-- ---------------------------------------------------------------------------
insert into public.profile_shares (owner_id, viewer_id, access_level) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'full'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'summary');

-- ---------------------------------------------------------------------------
-- Books (title, author, pages, status, favorite, rating, genre, isbn)
-- ---------------------------------------------------------------------------
with catalog(n, title, author, pages, status, favorite, rating, genre, isbn) as (values
  (1, 'Dune', 'Frank Herbert', 604, 'reading', true, null::numeric, 'Science Fiction', '9780441172719'),
  (2, 'Project Hail Mary', 'Andy Weir', 496, 'reading', false, null, 'Science Fiction', '9780593135204'),
  (3, 'Lonesome Dove', 'Larry McMurtry', 864, 'tbr', true, null, 'Western', '9780671683900'),
  (4, 'Jurassic Park', 'Michael Crichton', 448, 'finished', true, 4.25, 'Thriller', '9780345538987'),
  (5, 'A Game of Thrones', 'George R. R. Martin', 694, 'finished', true, 4.75, 'Fantasy', '9780553593716'),
  (6, 'Dungeon Crawler Carl', 'Matt Dinniman', 446, 'tbr', false, null, 'Fantasy', null),
  (7, 'The Hobbit', 'J. R. R. Tolkien', 310, 'finished', true, 4.5, 'Fantasy', '9780547928227'),
  (8, 'Can''t Hurt Me', 'David Goggins', 364, 'finished', false, 4, 'Memoir', '9781544512280'),
  (9, 'The Name of the Wind (The Kingkiller Chronicle, #1)', 'Patrick Rothfuss', 662, 'dnf', false, null, 'Fantasy', '9780756404741')
),
owners(user_id, picks) as (values
  ('11111111-1111-4111-8111-111111111111'::uuid, array[1,2,3,4,5,6,7,8,9]),
  ('22222222-2222-4222-8222-222222222222'::uuid, array[5,2,7,3,1,4]),
  ('33333333-3333-4333-8333-333333333333'::uuid, array[2,3,4,5,6])
)
insert into public.user_books (
  id, user_id, title, author, page_count, status, favorite, rating, genres, isbn, cover_url,
  current_page, shelf_order, started_on, finished_on, tbr_added_on
)
select
  md5(o.user_id::text || c.n)::uuid, o.user_id, c.title, c.author, c.pages, c.status, c.favorite, c.rating,
  array[c.genre], c.isbn,
  case when c.isbn is not null then 'https://covers.openlibrary.org/b/isbn/' || c.isbn || '-M.jpg?default=false' end,
  case c.status when 'reading' then 120 + c.n * 17 when 'finished' then c.pages else 0 end,
  c.n,
  case when c.status in ('reading', 'finished', 'dnf') then current_date - (35 + c.n * 20) end,
  case when c.status = 'finished' then current_date - (5 + c.n * 9) end,
  case when c.status = 'tbr' then current_date - (180 + c.n * 23) end
from owners o
cross join lateral unnest(o.picks) as p(n)
join catalog c on c.n = p.n;

-- ---------------------------------------------------------------------------
-- Reading sessions: the last ~60 days on currently-reading books
-- ---------------------------------------------------------------------------
insert into public.reading_sessions (
  user_id, user_book_id, session_date, duration_minutes, log_type, pages_read, activity_mode, start_local_time
)
select
  b.user_id, b.id, current_date - d,
  20 + (d * 7) % 45,
  'pages',
  8 + (d * 5) % 30,
  (array['reading', 'reading', 'audiobook', 'read_listen'])[1 + d % 4],
  make_time(6 + (d * 3) % 16, (d * 13) % 60, 0)
from public.user_books b
cross join generate_series(0, 60) as d
where b.status = 'reading' and d % 3 <> 1;

-- Annual and daily goals for this year
insert into public.reading_goals (user_id, year, books_target, daily_minutes_target)
select id, extract(year from current_date)::int, 24, 30
from public.profiles
where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333');
