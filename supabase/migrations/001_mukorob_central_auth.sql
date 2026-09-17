-- Mukorob PDF v0.8 foundation: central identity, tenancy and authorization.
-- Apply only to the dedicated Mukorob Supabase project.
-- IMPORTANT: this migration never stores application passwords and never grants
-- browser clients access to privileged service-role capabilities.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  package text not null default 'bradz_internal',
  status text not null default 'active' check (status in ('active','suspended','archived')),
  max_active_devices integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id text unique,
  full_name text,
  organisation_id uuid references public.organisations(id) on delete set null,
  role text not null default 'staff',
  status text not null default 'active' check (status in ('active','suspended','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff',
  status text not null default 'active' check (status in ('active','suspended','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.member_permissions (
  member_id uuid not null references public.organisation_members(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (member_id, permission_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  package text not null,
  status text not null default 'active' check (status in ('trialing','active','past_due','cancelled','expired')),
  max_active_devices integer,
  starts_at timestamptz not null default now(),
  renews_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  device_id text not null,
  device_name text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  mime_type text not null default 'application/pdf',
  storage_path text,
  size_bytes bigint,
  checksum text,
  status text not null default 'active' check (status in ('active','archived','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view','edit','download','manage')),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, shared_with_user_id)
);

create index if not exists idx_profiles_org on public.profiles(organisation_id);
create index if not exists idx_members_user on public.organisation_members(user_id);
create index if not exists idx_sessions_user_active on public.sessions(user_id, revoked_at);
create index if not exists idx_audit_org_time on public.audit_events(organisation_id, created_at desc);
create index if not exists idx_documents_org on public.documents(organisation_id);
create index if not exists idx_documents_owner on public.documents(owner_user_id);
create index if not exists idx_shares_user on public.document_shares(shared_with_user_id);

-- Seed application permissions. They are identifiers, not role decisions.
insert into public.permissions (code, description) values
  ('documents.read', 'Read permitted PDF documents'),
  ('documents.create', 'Create PDF document records'),
  ('documents.edit', 'Edit permitted PDF documents'),
  ('documents.share', 'Share permitted PDF documents'),
  ('documents.delete', 'Delete permitted PDF documents'),
  ('users.manage', 'Manage organisation users'),
  ('permissions.manage', 'Manage user permissions'),
  ('audit.read', 'Read organisation audit events'),
  ('audit.export', 'Export organisation audit events'),
  ('settings.manage', 'Manage organisation settings')
on conflict (code) do nothing;

-- Keep profile timestamps current without requiring client-side timestamp writes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organisations_set_updated_at on public.organisations;
create trigger organisations_set_updated_at before update on public.organisations for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists members_set_updated_at on public.organisation_members;
create trigger members_set_updated_at before update on public.organisation_members for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

-- Helper functions used by RLS. They return only membership/role facts from
-- rows the current authenticated user is allowed to evaluate.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organisation_members m
    where m.organisation_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organisation_members m
    where m.organisation_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('superadmin','admin')
  );
$$;

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.organisation_members enable row level security;
alter table public.permissions enable row level security;
alter table public.member_permissions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.sessions enable row level security;
alter table public.audit_events enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

-- Organisations: members may read their organisation; only admins manage it.
drop policy if exists organisations_select on public.organisations;
create policy organisations_select on public.organisations for select to authenticated using (public.is_org_member(id));
drop policy if exists organisations_admin_update on public.organisations;
create policy organisations_admin_update on public.organisations for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- Profiles: members can read profiles in their organisation; users may update only themselves.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_org_member(organisation_id));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Membership and permissions are admin-controlled.
drop policy if exists members_select on public.organisation_members;
create policy members_select on public.organisation_members for select to authenticated using (user_id = auth.uid() or public.is_org_member(organisation_id));
drop policy if exists members_admin_write on public.organisation_members;
create policy members_admin_write on public.organisation_members for all to authenticated using (public.is_org_admin(organisation_id)) with check (public.is_org_admin(organisation_id));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (true);
drop policy if exists member_permissions_select on public.member_permissions;
create policy member_permissions_select on public.member_permissions for select to authenticated using (
  exists (select 1 from public.organisation_members m where m.id = member_id and (m.user_id = auth.uid() or public.is_org_admin(m.organisation_id)))
);
drop policy if exists member_permissions_admin_write on public.member_permissions;
create policy member_permissions_admin_write on public.member_permissions for all to authenticated using (
  exists (select 1 from public.organisation_members m where m.id = member_id and public.is_org_admin(m.organisation_id))
) with check (
  exists (select 1 from public.organisation_members m where m.id = member_id and public.is_org_admin(m.organisation_id))
);

-- Subscription details are visible to organisation members; only admins can change them.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_org_member(organisation_id));
drop policy if exists subscriptions_admin_write on public.subscriptions;
create policy subscriptions_admin_write on public.subscriptions for all to authenticated using (public.is_org_admin(organisation_id)) with check (public.is_org_admin(organisation_id));

-- Users can see/manage only their own active device records; admins can manage their organisation's records.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated using (user_id = auth.uid() or (organisation_id is not null and public.is_org_admin(organisation_id)));
drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions for update to authenticated using (user_id = auth.uid() or (organisation_id is not null and public.is_org_admin(organisation_id))) with check (user_id = auth.uid() or (organisation_id is not null and public.is_org_admin(organisation_id)));

-- Audit events are append-only from the application perspective; users can read
-- their organisation's events, while inserts can be made by authenticated actors.
drop policy if exists audit_select on public.audit_events;
create policy audit_select on public.audit_events for select to authenticated using (actor_user_id = auth.uid() or (organisation_id is not null and public.is_org_member(organisation_id)));
drop policy if exists audit_insert on public.audit_events;
create policy audit_insert on public.audit_events for insert to authenticated with check (actor_user_id = auth.uid());

-- Documents: owner/member/sharing access is enforced centrally.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated using (
  owner_user_id = auth.uid()
  or public.is_org_member(organisation_id)
  or exists (select 1 from public.document_shares s where s.document_id = id and s.shared_with_user_id = auth.uid() and (s.expires_at is null or s.expires_at > now()))
);
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated with check (owner_user_id = auth.uid() and public.is_org_member(organisation_id));
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated using (owner_user_id = auth.uid() or public.is_org_admin(organisation_id)) with check (owner_user_id = auth.uid() or public.is_org_admin(organisation_id));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated using (owner_user_id = auth.uid() or public.is_org_admin(organisation_id));

-- Shares can be viewed by recipient/creator and created/changed by document owner/admin.
drop policy if exists shares_select on public.document_shares;
create policy shares_select on public.document_shares for select to authenticated using (
  shared_with_user_id = auth.uid()
  or created_by = auth.uid()
  or exists (select 1 from public.documents d where d.id = document_id and public.is_org_admin(d.organisation_id))
);
drop policy if exists shares_insert on public.document_shares;
create policy shares_insert on public.document_shares for insert to authenticated with check (
  created_by = auth.uid()
  and exists (select 1 from public.documents d where d.id = document_id and (d.owner_user_id = auth.uid() or public.is_org_admin(d.organisation_id)))
);
drop policy if exists shares_update on public.document_shares;
create policy shares_update on public.document_shares for update to authenticated using (
  created_by = auth.uid()
  or exists (select 1 from public.documents d where d.id = document_id and (d.owner_user_id = auth.uid() or public.is_org_admin(d.organisation_id)))
) with check (created_by = auth.uid());
drop policy if exists shares_delete on public.document_shares;
create policy shares_delete on public.document_shares for delete to authenticated using (
  created_by = auth.uid()
  or exists (select 1 from public.documents d where d.id = document_id and (d.owner_user_id = auth.uid() or public.is_org_admin(d.organisation_id)))
);
