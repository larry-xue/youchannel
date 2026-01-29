-- Live user profile context for Gemini Live (versioned, append-only)

create table public.live_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_version integer not null default 0,
  onboarding_completed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.live_user_profile_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  manual_text text not null,
  data jsonb not null default '{}'::jsonb,
  source jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint live_user_profile_versions_user_id_version_key unique(user_id, version),
  constraint live_user_profile_versions_manual_text_length_check
    check (char_length(manual_text) between 1 and 20000)
);

create index live_user_profile_versions_user_id_created_at_idx
  on public.live_user_profile_versions (user_id, created_at desc);

alter table public.live_user_profiles enable row level security;
alter table public.live_user_profile_versions enable row level security;

create policy "Users can view their live profile"
  on public.live_user_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their live profile"
  on public.live_user_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their live profile"
  on public.live_user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their live profile"
  on public.live_user_profiles for delete
  using (auth.uid() = user_id);

create policy "Users can view their live profile versions"
  on public.live_user_profile_versions for select
  using (auth.uid() = user_id);

create trigger set_live_user_profiles_updated_at
  before update on public.live_user_profiles
  for each row execute function public.set_updated_at();

-- RPC: create a new profile version (atomic version bump + insert).
-- SECURITY DEFINER so it can write regardless of RLS, but it always binds to auth.uid().
create or replace function public.create_live_user_profile_version(
  p_manual_text text,
  p_data jsonb default '{}'::jsonb,
  p_source jsonb default '{}'::jsonb
)
returns table(version integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_new_version integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'User not authenticated';
  end if;

  if p_manual_text is null or char_length(trim(p_manual_text)) = 0 then
    raise exception 'manual_text is required';
  end if;

  insert into public.live_user_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  update public.live_user_profiles
  set
    current_version = current_version + 1,
    onboarding_completed_at = coalesce(
      onboarding_completed_at,
      timezone('utc'::text, now())
    )
  where user_id = v_user_id
  returning current_version into v_new_version;

  insert into public.live_user_profile_versions (
    user_id,
    version,
    manual_text,
    data,
    source
  ) values (
    v_user_id,
    v_new_version,
    p_manual_text,
    coalesce(p_data, '{}'::jsonb),
    coalesce(p_source, '{}'::jsonb)
  );

  return query select v_new_version;
end;
$$;

grant execute on function public.create_live_user_profile_version(text, jsonb, jsonb)
  to authenticated;
