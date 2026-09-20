/* Mukorob PDF — central Supabase identity bridge.
   IndexedDB remains the offline cache; Supabase Auth is the cross-device identity. */
(() => {
  const A = window.MukorobApp;
  if (!A || !window.supabase) return;

  const SUPABASE_URL = 'https://bitxwbayqnwyblkwqspy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable__qvhAyJ8t33Cwv9XbWh7ZQ_MD1yoPLf';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const CENTRAL_EMAIL_DOMAIN = 'users.mukorob.app';

  const centralEmail = (id) => String(id || '').trim().toLowerCase() + '@' + CENTRAL_EMAIL_DOMAIN;

  async function profileFor(userId) {
    const { data: profile, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    const { data: memberships, error: mErr } = await client
      .from('organization_members')
      .select('organization_id,permissions,active,organizations:organization_id(id,name,sector,status,trial_start,trial_end)')
      .eq('user_id', userId).eq('active', true);
    if (mErr) throw mErr;
    return { profile, memberships: memberships || [] };
  }

  function applyCentralIdentity(authUser, profile, memberships) {
    if (!profile || !profile.active) throw new Error('Mukorob account is not active.');
    const membership = memberships.find(m => m.organizations?.status === 'active' || m.organizations?.status === 'trial') || memberships[0] || null;
    if (membership?.organizations?.trial_end && new Date(membership.organizations.trial_end).getTime() < Date.now()) {
      throw new Error('Your Mukorob company trial has expired.');
    }
    const permissions = membership?.permissions || {};
    const local = {
      id: profile.user_id,
      fullName: profile.full_name,
      role: profile.role,
      permissions,
      disabled: !profile.active,
      authProvider: 'supabase',
      authUserId: authUser.id,
      organizationId: membership?.organization_id || null,
      organizationName: membership?.organizations?.name || '',
      organizationSector: membership?.organizations?.sector || ''
    };
    A.state.auth.user = local;
    A.state.auth.session = authUser.id;
    localStorage.setItem('mukorob-central-user', JSON.stringify({id: local.id, organizationId: local.organizationId}));
    document.querySelector('#authModal')?.setAttribute('hidden', '');
    document.querySelector('#authModal').hidden = true;
    A.updateZoomControls();
    window.dispatchEvent(new CustomEvent('mukorob:auth-changed', {detail:{user:local}}));
    return local;
  }

  async function ensureProfile(authUser, localUser) {
    const { data: existing } = await client.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (existing) return existing;
    const { data, error } = await client.from('profiles').insert({
      id: authUser.id,
      user_id: localUser.id,
      full_name: localUser.fullName || localUser.id,
      role: localUser.role === 'superadmin' ? 'superadmin' : 'staff',
      active: true
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function centralLogin(id, password) {
    const normalized = A.normalizeId(id);
    let { data, error } = await client.auth.signInWithPassword({email: centralEmail(normalized), password});
    if (error) {
      // One-time migration path: validate the existing local credential, then create
      // the central Supabase Auth identity. Password hashes are never copied.
      const local = await A.getUser(normalized);
      if (!local || local.disabled) throw error;
      const localHash = await A.hashPassword(password, local.passwordSalt);
      if (localHash !== local.passwordHash) throw error;
      const signup = await client.auth.signUp({email: centralEmail(normalized), password, options:{data:{mukorob_user_id:normalized,full_name:local.fullName}}});
      if (signup.error) throw signup.error;
      if (!signup.data.session || !signup.data.user) {
        throw new Error('Central account created, but Supabase email confirmation is required. Disable email confirmation for this internal pilot or configure a real recovery email.');
      }
      data = signup.data;
    }
    const bundle = await profileFor(data.user.id);
    const profile = await ensureProfile(data.user, await A.getUser(normalized));
    applyCentralIdentity(data.user, profile, bundle.memberships);
    await A.writeAudit('central-login', {userId: normalized});
    return true;
  }

  async function centralLogout() {
    await client.auth.signOut();
    localStorage.removeItem('mukorob-central-user');
    A.state.auth.user = null;
    A.state.auth.session = null;
    A.updateZoomControls();
    window.dispatchEvent(new CustomEvent('mukorob:auth-changed', {detail:{user:null}}));
  }

  async function restoreCentral() {
    const {data} = await client.auth.getSession();
    if (!data.session?.user) return false;
    try {
      const bundle = await profileFor(data.session.user.id);
      applyCentralIdentity(data.session.user, bundle.profile, bundle.memberships);
      await A.renderRecentList();
      return true;
    } catch (e) {
      console.warn('[Mukorob central auth]', e);
      await client.auth.signOut();
      return false;
    }
  }

  function addCompanySelector() {
    const form = document.querySelector('#userManagementSection .user-form-grid');
    if (!form || document.querySelector('#newUserCompany')) return;
    const select = document.createElement('select');
    select.id = 'newUserCompany';
    select.innerHTML = '<option value="">Select pilot company</option><option value="d0f9d41e-fe8a-4760-991c-bc56eca04411">Hydraform Interlocking Solutions CC</option><option value="95ea4b45-53b1-4e2c-b9da-a9ec2a3fd758">Stratsure Insurance (Pty) Ltd.</option>';
    select.title = 'Company';
    form.appendChild(select);
  }

  async function provisionUser() {
    const id = A.normalizeId(document.querySelector('#newUserName')?.value);
    const fullName = document.querySelector('#newUserFullName')?.value.trim();
    const password = document.querySelector('#newUserPassword')?.value;
    const organizationId = document.querySelector('#newUserCompany')?.value;
    const perms = {};
    document.querySelectorAll('#permissionChecks input').forEach(c => perms[c.dataset.permission] = c.checked);
    if (!id || !fullName || !password || !organizationId) return A.toast('User ID, staff name, temporary password and company are required.');
    try {
      A.toast('Registering central Mukorob user…');
      const {data: sessionData} = await client.auth.getSession();
      if (!sessionData.session) throw new Error('Super Admin session is not available.');
      const res = await fetch(SUPABASE_URL + '/functions/v1/mukorob-admin', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+sessionData.session.access_token,'apikey':SUPABASE_KEY},
        body:JSON.stringify({action:'create_user',userId:id,fullName,password,organizationId,permissions:perms})
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Central user registration failed.');
      await A.writeAudit('central-user-created',{targetUserId:id,organizationId});
      document.querySelector('#newUserName').value='';
      document.querySelector('#newUserFullName').value='';
      document.querySelector('#newUserPassword').value='';
      document.querySelector('#newUserCompany').value='';
      A.toast('Central user '+id+' registered for '+body.organizationName+'.');
      if (typeof window.MukorobRefreshUsers === 'function') window.MukorobRefreshUsers();
    } catch (e) {
      console.error(e);
      A.toast(e.message || 'Could not register central user.');
    }
  }

  function interceptUI() {
    addCompanySelector();
    const create = document.querySelector('#btnCreateUser');
    if (create && !create.dataset.centralAuth) {
      create.dataset.centralAuth='1';
      create.addEventListener('click', e => {
        if (!A.state.auth.user || A.state.auth.user.role !== 'superadmin') return;
        if (A.state.adminEditingUserId) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        provisionUser();
      }, true);
    }
    const logout = document.querySelector('#btnLogout');
    if (logout && !logout.dataset.centralAuth) {
      logout.dataset.centralAuth='1';
      logout.addEventListener('click', e => {
        if (A.state.auth.user?.authProvider !== 'supabase') return;
        e.stopImmediatePropagation();
        e.preventDefault();
        centralLogout();
      }, true);
    }
  }

  document.addEventListener('click', async e => {
    if (e.target?.id === 'btnLogin') {
      e.stopImmediatePropagation();
      e.preventDefault();
      const id=document.querySelector('#loginUser')?.value;
      const password=document.querySelector('#loginPassword')?.value;
      try {
        document.querySelector('#loginError').hidden=true;
        await centralLogin(id,password);
        document.querySelector('#loginPassword').value='';
        A.updateZoomControls();
        await A.renderRecentList();
        await A.consumePendingLaunchFiles?.();
        A.toast('Welcome, '+(A.state.auth.user.fullName||A.state.auth.user.id)+'.');
      } catch(err) {
        const msg=err?.message || 'Central sign-in failed.';
        const box=document.querySelector('#loginError');
        box.textContent=msg; box.hidden=false;
      }
    }
  }, true);

  window.MukorobSupabase = {client, centralLogin, centralLogout, restoreCentral, provisionUser};

  const boot = async () => {
    interceptUI();
    await restoreCentral();
    interceptUI();
    if (!A.state.auth.user) {
      const modal=document.querySelector('#authModal');
      if (modal) modal.hidden=false;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();