-- ==============================================================================
-- YTA - colabapp Production Database Schema for Supabase
-- Unified Multi-Platform Backend for Web (Vercel) and Android (Native/Flutter)
-- ==============================================================================

-- Enable required PostgreSQL extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Extends auth.users; supports Owner, Admin, and Member roles)
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text unique not null,
    is_admin boolean default false not null,
    is_owner boolean default false not null,
    password_text text,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- Migration helpers for existing deployments:
alter table public.profiles add column if not exists is_owner boolean default false not null;
alter table public.profiles add column if not exists password_text text;

-- ------------------------------------------------------------------------------
-- 2. CHANNELS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.channels (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- ------------------------------------------------------------------------------
-- 3. VIDEOS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.videos (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid references public.channels(id) on delete cascade not null,
    video_number integer not null,
    title text,
    status boolean default false not null,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    unique(channel_id, video_number)
);

-- ------------------------------------------------------------------------------
-- 4. ROLES TABLE (4 standard + custom)
-- ------------------------------------------------------------------------------
create table if not exists public.roles (
    id uuid primary key default gen_random_uuid(),
    name text unique not null,
    input_type text not null check (input_type in ('text', 'number', 'file')),
    created_at timestamptz default now() not null
);

-- ------------------------------------------------------------------------------
-- 5. ROLE PROMPTS TABLE (Channel-specific and role-specific prompt templates)
-- ------------------------------------------------------------------------------
create table if not exists public.role_prompts (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid references public.channels(id) on delete cascade,
    role_id uuid references public.roles(id) on delete cascade not null,
    label text default 'Prompt' not null,
    prompt_text text not null,
    sort_order integer default 0 not null,
    created_at timestamptz default now() not null
);

-- Migration helper for existing deployments:
alter table public.role_prompts add column if not exists channel_id uuid references public.channels(id) on delete cascade;
create index if not exists idx_role_prompts_channel on public.role_prompts(channel_id);

-- ------------------------------------------------------------------------------
-- 6. MEMBER ROLES JUNCTION TABLE (Many-to-Many)
-- ------------------------------------------------------------------------------
create table if not exists public.member_roles (
    id uuid primary key default gen_random_uuid(),
    member_id uuid references public.profiles(id) on delete cascade not null,
    role_id uuid references public.roles(id) on delete cascade not null,
    unique(member_id, role_id)
);

-- ------------------------------------------------------------------------------
-- 7. SUBMISSIONS TABLE (One row per video + role; supports atomic overwrite)
-- ------------------------------------------------------------------------------
create table if not exists public.submissions (
    id uuid primary key default gen_random_uuid(),
    video_id uuid references public.videos(id) on delete cascade not null,
    role_id uuid references public.roles(id) on delete cascade not null,
    submitted_by uuid references public.profiles(id) on delete set null,
    content_text text,
    file_path text,
    file_name text,
    submitted_at timestamptz default now() not null,
    unique(video_id, role_id)
);

-- ------------------------------------------------------------------------------
-- 8. LEDGER TABLE (Append-Only Audit Log)
-- ------------------------------------------------------------------------------
create table if not exists public.ledger (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references public.profiles(id) on delete set null,
    action text not null,
    channel_id uuid references public.channels(id) on delete set null,
    video_id uuid references public.videos(id) on delete set null,
    details jsonb,
    created_at timestamptz default now() not null
);

-- ------------------------------------------------------------------------------
-- 9. NOTIFICATIONS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid references public.profiles(id) on delete cascade not null,
    message text not null,
    related_video_id uuid references public.videos(id) on delete set null,
    related_role_id uuid references public.roles(id) on delete set null,
    is_read boolean default false not null,
    created_at timestamptz default now() not null
);

-- ------------------------------------------------------------------------------
-- HELPER FUNCTIONS FOR SECURITY & RBAC
-- ------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------------------------
-- AUTOMATIC PROFILE CREATION TRIGGER ON AUTH.USERS
-- ------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
    _username text;
    _is_admin boolean;
    _is_owner boolean;
    _password_text text;
begin
    _username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
    _is_admin := coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false);
    _is_owner := coalesce((new.raw_user_meta_data->>'is_owner')::boolean, false);
    _password_text := new.raw_user_meta_data->>'password_text';
    
    -- If username is 'admin' or 'owner' or starts with admin@ / owner@, grant owner & admin status
    if lower(_username) in ('admin', 'owner') or lower(new.email) like 'admin@%' or lower(new.email) like 'owner@%' then
        _is_admin := true;
        _is_owner := true;
    end if;

    insert into public.profiles (id, username, is_admin, is_owner, password_text, created_at, updated_at)
    values (new.id, _username, _is_admin, _is_owner, _password_text, now(), now())
    on conflict (id) do update set
        username = excluded.username,
        is_admin = excluded.is_admin,
        is_owner = excluded.is_owner,
        password_text = coalesce(excluded.password_text, public.profiles.password_text),
        updated_at = now();

    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------------------
-- CREDENTIALS MANAGEMENT RPC FUNCTION (For Owner & Admin)
-- ------------------------------------------------------------------------------
create or replace function public.admin_update_user_credentials(
    target_user_id uuid,
    new_username text,
    new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    -- Update auth.users credentials if password provided
    if new_password is not null and new_password <> '' then
        update auth.users
        set encrypted_password = crypt(new_password, gen_salt('bf')),
            email = lower(new_username) || '@colab.yta',
            raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{username}', to_jsonb(new_username))
        where id = target_user_id;
    else
        update auth.users
        set email = lower(new_username) || '@colab.yta',
            raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{username}', to_jsonb(new_username))
        where id = target_user_id;
    end if;

    -- Update public.profiles record
    update public.profiles
    set username = new_username,
        password_text = coalesce(nullif(new_password, ''), password_text),
        updated_at = now()
    where id = target_user_id;
end;
$$;

-- ------------------------------------------------------------------------------
-- STORAGE BUCKETS (Thumbnails & Voiceovers)
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) 
values ('thumbnails', 'thumbnails', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public) 
values ('voiceovers', 'voiceovers', true)
on conflict (id) do update set public = true;

-- Storage RLS Policies
create policy "Allow authenticated uploads to thumbnails"
on storage.objects for insert to authenticated
with check (bucket_id = 'thumbnails');

create policy "Allow authenticated updates to thumbnails"
on storage.objects for update to authenticated
using (bucket_id = 'thumbnails');

create policy "Allow read access to thumbnails"
on storage.objects for select to public
using (bucket_id = 'thumbnails');

create policy "Allow authenticated uploads to voiceovers"
on storage.objects for insert to authenticated
with check (bucket_id = 'voiceovers');

create policy "Allow authenticated updates to voiceovers"
on storage.objects for update to authenticated
using (bucket_id = 'voiceovers');

create policy "Allow read access to voiceovers"
on storage.objects for select to public
using (bucket_id = 'voiceovers');

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.videos enable row level security;
alter table public.roles enable row level security;
alter table public.role_prompts enable row level security;
alter table public.member_roles enable row level security;
alter table public.submissions enable row level security;
alter table public.ledger enable row level security;
alter table public.notifications enable row level security;

-- PROFILES POLICIES
create policy "Profiles are viewable by authenticated users"
on public.profiles for select to authenticated using (true);

create policy "Users can update own profile or admin can update any"
on public.profiles for update to authenticated
using (auth.uid() = id or public.is_admin());

create policy "Users and admin can insert profiles"
on public.profiles for insert to authenticated
with check (auth.uid() = id or public.is_admin());

create policy "Admin can delete profiles"
on public.profiles for delete to authenticated
using (public.is_admin());

-- CHANNELS POLICIES
create policy "Channels viewable by authenticated users"
on public.channels for select to authenticated using (true);

create policy "Admin can insert channels"
on public.channels for insert to authenticated
with check (public.is_admin());

create policy "Admin can update channels"
on public.channels for update to authenticated
using (public.is_admin());

create policy "Admin can delete channels"
on public.channels for delete to authenticated
using (public.is_admin());

-- VIDEOS POLICIES
create policy "Videos viewable by authenticated users"
on public.videos for select to authenticated using (true);

create policy "Admin can insert videos"
on public.videos for insert to authenticated
with check (public.is_admin());

create policy "Admin can update videos"
on public.videos for update to authenticated
using (public.is_admin());

create policy "Admin can delete videos"
on public.videos for delete to authenticated
using (public.is_admin());

-- ROLES POLICIES
create policy "Roles viewable by authenticated users"
on public.roles for select to authenticated using (true);

create policy "Admin can insert roles"
on public.roles for insert to authenticated
with check (public.is_admin());

create policy "Admin can update roles"
on public.roles for update to authenticated
using (public.is_admin());

create policy "Admin can delete roles"
on public.roles for delete to authenticated
using (public.is_admin());

-- ROLE PROMPTS POLICIES
create policy "Role prompts viewable by authenticated users"
on public.role_prompts for select to authenticated using (true);

create policy "Admin can insert role prompts"
on public.role_prompts for insert to authenticated
with check (public.is_admin());

create policy "Admin can update role prompts"
on public.role_prompts for update to authenticated
using (public.is_admin());

create policy "Admin can delete role prompts"
on public.role_prompts for delete to authenticated
using (public.is_admin());

-- MEMBER ROLES POLICIES
create policy "Members can view their own roles or admin can view all"
on public.member_roles for select to authenticated
using (member_id = auth.uid() or public.is_admin());

create policy "Admin can insert member roles"
on public.member_roles for insert to authenticated
with check (public.is_admin());

create policy "Admin can update member roles"
on public.member_roles for update to authenticated
using (public.is_admin());

create policy "Admin can delete member roles"
on public.member_roles for delete to authenticated
using (public.is_admin());

-- SUBMISSIONS POLICIES
create policy "Submissions viewable by authenticated users"
on public.submissions for select to authenticated using (true);

create policy "Assigned member or admin can insert submissions"
on public.submissions for insert to authenticated
with check (
    public.is_admin() or exists (
        select 1 from public.member_roles mr
        where mr.member_id = auth.uid() and mr.role_id = submissions.role_id
    )
);

create policy "Assigned member or admin can update submissions"
on public.submissions for update to authenticated
using (
    public.is_admin() or exists (
        select 1 from public.member_roles mr
        where mr.member_id = auth.uid() and mr.role_id = submissions.role_id
    )
);

create policy "Admin can delete submissions"
on public.submissions for delete to authenticated
using (public.is_admin());

-- LEDGER POLICIES (Append-Only Audit)
create policy "Ledger viewable by authenticated users"
on public.ledger for select to authenticated using (true);

create policy "Authenticated users can insert ledger entries"
on public.ledger for insert to authenticated with check (true);

-- Note: No UPDATE or DELETE policies on ledger -> Unalterable append-only audit trail!

-- NOTIFICATIONS POLICIES
create policy "Users can view their own notifications or admin can view all"
on public.notifications for select to authenticated
using (recipient_id = auth.uid() or public.is_admin());

create policy "Users can update own notifications (mark read) or admin can update"
on public.notifications for update to authenticated
using (recipient_id = auth.uid() or public.is_admin());

create policy "Authenticated users can insert notifications"
on public.notifications for insert to authenticated with check (true);

create policy "Users can delete own notifications or admin can delete"
on public.notifications for delete to authenticated
using (recipient_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------------------------
-- REALTIME REPLICATION PUBLICATION
-- ------------------------------------------------------------------------------
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.videos;
alter publication supabase_realtime add table public.roles;
alter publication supabase_realtime add table public.role_prompts;
alter publication supabase_realtime add table public.member_roles;
alter publication supabase_realtime add table public.submissions;
alter publication supabase_realtime add table public.ledger;
alter publication supabase_realtime add table public.notifications;

-- ------------------------------------------------------------------------------
-- INITIAL SEED DATA (4 Standard Roles + Prompts)
-- ------------------------------------------------------------------------------
insert into public.roles (name, input_type) values
    ('Script', 'text'),
    ('voiceover', 'file'),
    ('thumbnail', 'file'),
    ('Meta Info', 'text')
on conflict (name) do update set input_type = excluded.input_type;

-- Standard role prompts for quick productivity
insert into public.role_prompts (role_id, label, prompt_text, sort_order)
select id, 'YouTube Hook & Outline Prompt', 'Create a high-retention 60-second hook and structured 5-part script outline for a YouTube video based on the following title: [TITLE]. Focus on pacing, curious open loops, and concise storytelling.', 0
from public.roles where name = 'Script'
on conflict do nothing;

insert into public.role_prompts (role_id, label, prompt_text, sort_order)
select id, 'SEO Description & Tags Prompt', 'Generate a 3-paragraph SEO-optimized YouTube description with high-converting search keywords, followed by 15 comma-separated tags and 3 relevant hashtags for this title: [TITLE].', 0
from public.roles where name = 'Meta Info'
on conflict do nothing;

-- Link admin profile and designate primary owner if an existing auth user exists
do $$
declare
    first_user_id uuid;
begin
    select id into first_user_id from auth.users order by created_at asc limit 1;
    if first_user_id is not null then
        insert into public.profiles (id, username, is_admin, is_owner)
        values (first_user_id, 'admin', true, true)
        on conflict (id) do update set is_admin = true, is_owner = true;
    end if;
end $$;

