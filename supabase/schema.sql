create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.represented_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  provider text not null,
  base_currency text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint represented_accounts_owner_provider_name_key unique (owner_user_id, provider, name)
);

create table if not exists public.live_chart_presets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  represented_account_id uuid references public.represented_accounts (id) on delete set null,
  provider text not null,
  name text not null,
  assets jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_chart_presets_assets_array_check check (jsonb_typeof(assets) = 'array'),
  constraint live_chart_presets_owner_account_name_key unique (owner_user_id, represented_account_id, name)
);

create table if not exists public.user_preferences (
  owner_user_id uuid primary key references auth.users (id) on delete cascade,
  selected_preset_id uuid references public.live_chart_presets (id) on delete set null,
  selected_timeframe text,
  selected_represented_account_id uuid references public.represented_accounts (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.imported_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  represented_account_id uuid not null references public.represented_accounts (id) on delete cascade,
  source_platform text not null,
  external_id text not null,
  source_file_name text,
  occurred_at timestamptz not null,
  transaction_type text not null,
  asset text not null,
  quote text,
  quantity double precision,
  execution_price double precision,
  gross_value double precision,
  fee double precision,
  fee_currency text,
  net_quantity double precision,
  net_value double precision,
  exchange text not null,
  data_source text not null default 'Imported CSV',
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint imported_transactions_owner_account_platform_external_key unique (
    owner_user_id,
    represented_account_id,
    source_platform,
    external_id
  )
);

create table if not exists public.import_history_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  represented_account_id uuid not null references public.represented_accounts (id) on delete cascade,
  source_platform text not null,
  stored_file_name text not null,
  original_file_name text,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  file_size_bytes bigint not null default 0,
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint import_history_files_owner_bucket_path_key unique (
    owner_user_id,
    storage_bucket,
    storage_path
  )
);

create index if not exists represented_accounts_owner_user_id_idx
  on public.represented_accounts (owner_user_id);

create index if not exists live_chart_presets_owner_user_id_idx
  on public.live_chart_presets (owner_user_id);

create index if not exists live_chart_presets_owner_account_idx
  on public.live_chart_presets (owner_user_id, represented_account_id);

create index if not exists user_preferences_selected_preset_id_idx
  on public.user_preferences (selected_preset_id);

create index if not exists user_preferences_selected_represented_account_id_idx
  on public.user_preferences (selected_represented_account_id);

create index if not exists imported_transactions_owner_user_id_idx
  on public.imported_transactions (owner_user_id);

create index if not exists imported_transactions_account_id_idx
  on public.imported_transactions (represented_account_id);

create index if not exists imported_transactions_occurred_at_idx
  on public.imported_transactions (occurred_at desc);

create index if not exists import_history_files_owner_user_id_idx
  on public.import_history_files (owner_user_id);

create index if not exists import_history_files_account_id_idx
  on public.import_history_files (represented_account_id);

create index if not exists import_history_files_imported_at_idx
  on public.import_history_files (imported_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_represented_accounts_updated_at on public.represented_accounts;
create trigger set_represented_accounts_updated_at
before update on public.represented_accounts
for each row
execute function public.set_updated_at();

drop trigger if exists set_live_chart_presets_updated_at on public.live_chart_presets;
create trigger set_live_chart_presets_updated_at
before update on public.live_chart_presets
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_imported_transactions_updated_at on public.imported_transactions;
create trigger set_imported_transactions_updated_at
before update on public.imported_transactions
for each row
execute function public.set_updated_at();

drop trigger if exists set_import_history_files_updated_at on public.import_history_files;
create trigger set_import_history_files_updated_at
before update on public.import_history_files
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_account_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.represented_accounts (owner_user_id, name, provider, base_currency)
  values (new.id, 'All', 'all', 'EUR')
  on conflict (owner_user_id, provider, name)
  do update
    set base_currency = excluded.base_currency,
        updated_at = timezone('utc', now())
  returning id into default_account_id;

  if default_account_id is null then
    select id
    into default_account_id
    from public.represented_accounts
    where owner_user_id = new.id
      and provider = 'all'
      and name = 'All'
    limit 1;
  end if;

  insert into public.user_preferences (
    owner_user_id,
    selected_preset_id,
    selected_timeframe,
    selected_represented_account_id
  )
  values (new.id, null, '1h', default_account_id)
  on conflict (owner_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.represented_accounts enable row level security;
alter table public.live_chart_presets enable row level security;
alter table public.user_preferences enable row level security;
alter table public.imported_transactions enable row level security;
alter table public.import_history_files enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

drop policy if exists "represented_accounts_select_own" on public.represented_accounts;
create policy "represented_accounts_select_own"
on public.represented_accounts
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "represented_accounts_insert_own" on public.represented_accounts;
create policy "represented_accounts_insert_own"
on public.represented_accounts
for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists "represented_accounts_update_own" on public.represented_accounts;
create policy "represented_accounts_update_own"
on public.represented_accounts
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "represented_accounts_delete_own" on public.represented_accounts;
create policy "represented_accounts_delete_own"
on public.represented_accounts
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "live_chart_presets_select_own" on public.live_chart_presets;
create policy "live_chart_presets_select_own"
on public.live_chart_presets
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "live_chart_presets_insert_own" on public.live_chart_presets;
create policy "live_chart_presets_insert_own"
on public.live_chart_presets
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and (
    represented_account_id is null
    or exists (
      select 1
      from public.represented_accounts accounts
      where accounts.id = represented_account_id
        and accounts.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists "live_chart_presets_update_own" on public.live_chart_presets;
create policy "live_chart_presets_update_own"
on public.live_chart_presets
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and (
    represented_account_id is null
    or exists (
      select 1
      from public.represented_accounts accounts
      where accounts.id = represented_account_id
        and accounts.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists "live_chart_presets_delete_own" on public.live_chart_presets;
create policy "live_chart_presets_delete_own"
on public.live_chart_presets
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
on public.user_preferences
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own"
on public.user_preferences
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and (
    selected_represented_account_id is null
    or exists (
      select 1
      from public.represented_accounts accounts
      where accounts.id = selected_represented_account_id
        and accounts.owner_user_id = auth.uid()
    )
  )
  and (
    selected_preset_id is null
    or exists (
      select 1
      from public.live_chart_presets presets
      where presets.id = selected_preset_id
        and presets.owner_user_id = auth.uid()
        and (
          selected_represented_account_id is null
          or presets.represented_account_id is not distinct from selected_represented_account_id
        )
    )
  )
);

drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own"
on public.user_preferences
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and (
    selected_represented_account_id is null
    or exists (
      select 1
      from public.represented_accounts accounts
      where accounts.id = selected_represented_account_id
        and accounts.owner_user_id = auth.uid()
    )
  )
  and (
    selected_preset_id is null
    or exists (
      select 1
      from public.live_chart_presets presets
      where presets.id = selected_preset_id
        and presets.owner_user_id = auth.uid()
        and (
          selected_represented_account_id is null
          or presets.represented_account_id is not distinct from selected_represented_account_id
        )
    )
  )
);

drop policy if exists "user_preferences_delete_own" on public.user_preferences;
create policy "user_preferences_delete_own"
on public.user_preferences
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "imported_transactions_select_own" on public.imported_transactions;
create policy "imported_transactions_select_own"
on public.imported_transactions
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "imported_transactions_insert_own" on public.imported_transactions;
create policy "imported_transactions_insert_own"
on public.imported_transactions
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.represented_accounts accounts
    where accounts.id = represented_account_id
      and accounts.owner_user_id = auth.uid()
  )
);

drop policy if exists "imported_transactions_update_own" on public.imported_transactions;
create policy "imported_transactions_update_own"
on public.imported_transactions
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.represented_accounts accounts
    where accounts.id = represented_account_id
      and accounts.owner_user_id = auth.uid()
  )
);

drop policy if exists "imported_transactions_delete_own" on public.imported_transactions;
create policy "imported_transactions_delete_own"
on public.imported_transactions
for delete
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "import_history_files_select_own" on public.import_history_files;
create policy "import_history_files_select_own"
on public.import_history_files
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "import_history_files_insert_own" on public.import_history_files;
create policy "import_history_files_insert_own"
on public.import_history_files
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.represented_accounts accounts
    where accounts.id = represented_account_id
      and accounts.owner_user_id = auth.uid()
  )
);

drop policy if exists "import_history_files_update_own" on public.import_history_files;
create policy "import_history_files_update_own"
on public.import_history_files
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.represented_accounts accounts
    where accounts.id = represented_account_id
      and accounts.owner_user_id = auth.uid()
  )
);

drop policy if exists "import_history_files_delete_own" on public.import_history_files;
create policy "import_history_files_delete_own"
on public.import_history_files
for delete
to authenticated
using (auth.uid() = owner_user_id);

insert into storage.buckets (id, name, public)
values ('transaction-import-history', 'transaction-import-history', false)
on conflict (id) do nothing;

drop policy if exists "transaction_import_history_select_own" on storage.objects;
create policy "transaction_import_history_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_import_history_insert_own" on storage.objects;
create policy "transaction_import_history_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_import_history_update_own" on storage.objects;
create policy "transaction_import_history_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_import_history_delete_own" on storage.objects;
create policy "transaction_import_history_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'transaction-import-history'
  and (storage.foldername(name))[1] = auth.uid()::text
);
