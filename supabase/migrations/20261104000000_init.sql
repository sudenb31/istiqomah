-- Skema Istiqomah. Setiap pengguna hanya bisa membaca datanya sendiri.
-- Token Google tidak bisa dijangkau dari browser sama sekali.

-- Data aplikasi per pengguna, disimpan sebagai satu dokumen.
create table public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "Pengguna membaca datanya sendiri"
  on public.app_state for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.app_state from anon;
revoke insert, update, delete, truncate, references, trigger on public.app_state from authenticated;
grant select on public.app_state to authenticated;

-- Penulisan lewat fungsi supaya dua perangkat tidak saling menimpa diam-diam.
-- Mengembalikan rev baru, atau null kalau rev sudah berubah dan klien perlu menggabungkan ulang.
create function public.save_state(new_doc jsonb, expected_rev bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  next_rev bigint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if pg_column_size(new_doc) > 5000000 then
    raise exception 'state too large' using errcode = '22023';
  end if;

  if expected_rev = 0 then
    insert into public.app_state (user_id, doc)
    values (uid, new_doc)
    on conflict (user_id) do nothing
    returning rev into next_rev;
  else
    update public.app_state
    set doc = new_doc, rev = rev + 1, updated_at = now()
    where user_id = uid and rev = expected_rev
    returning rev into next_rev;
  end if;

  return next_rev;
end;
$$;

revoke all on function public.save_state(jsonb, bigint) from public, anon;
grant execute on function public.save_state(jsonb, bigint) to authenticated;

-- Sambungan Google. Refresh token disimpan terenkripsi. Tanpa policy dan tanpa grant,
-- jadi hanya fungsi server dengan secret key yang bisa membacanya.
create table public.google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_enc text not null,
  calendar_id text,
  google_email text,
  needs_reconnect boolean not null default false,
  connected_at timestamptz not null default now()
);

alter table public.google_accounts enable row level security;
revoke all on public.google_accounts from anon, authenticated;

-- Tiket sekali pakai untuk proses izin Google.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;
