/* Mukorob PDF — central Supabase identity bridge.
   IndexedDB remains the offline cache; Supabase Auth is the cross-device identity. */
(() => {
  const A = window.MukorobApp;
  if (!A) return;

  const SUPABASE_URL = 'https://bitxwbayqnwyblkwqspy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable__qvhAyJ8t33Cwv9XbWh7ZQ_MD1yoPLf';
  let client = null;
  async function initSupabase() {
    if (window.supabase?.createClient) { client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); return client; }
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    client = mod.createClient(SUPABASE_URL, SUPABASE_KEY);
    return client;
  }
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

    // v0.7.4 safety fix:
    // Do NOT call auth.signUp() as an automatic fallback from the login screen.
    // That path can trigger Supabase email/rate limits and, with hosted email
    // confirmation enabled, it cannot create a usable internal session anyway.
    // Existing Bradz/Mukorob local accounts must remain usable while the central
    // identity migration is being completed.
    let { data, error } = await client.auth.signInWithPassword({
      email: centralEmail(normalized),
      password
    });

    if (!error && data?.user) {
      const bundle = await profileFor(data.user.id);
      const local = await A.getUser(normalized);
      const profile = await ensureProfile(data.user, local);
      applyCentralIdentity(data.user, profile, bundle.memberships);
      await A.writeAudit('central-login', {userId: normalized});
      return true;
    }

    // Safe local-first fallback for accounts that have not yet been provisioned
    // in Supabase Auth. This deliberately avoids signUp(), so a login attempt
    // cannot consume the Auth email rate limit.
    const local = await A.getUser(normalized);
    if (local && !local.disabled) {
      const localHash = await A.hashPassword(password, local.passwordSalt);
      if (localHash === local.passwordHash) {
        A.state.auth.user = local;
        A.state.auth.session = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random();
        localStorage.setItem('mukorob-pdf-session-v1', JSON.stringify({
          id: local.id,
          token: A.state.auth.session,
          createdAt: Date.now()
        }));
        local.lastLoginAt = Date.now();
        await A.db.put('users', local);
        await A.writeAudit('login-local-fallback', {
          userId: normalized,
          centralAuthStatus: error?.message || 'central-account-not-provisioned'
        });
        A.updateZoomControls();
        window.dispatchEvent(new CustomEvent('mukorob:auth-changed', {detail:{user:local}}));
        return true;
      }
    }

    // Preserve the real central error only after the local credential check has
    // failed. No account creation or email is attempted here.
    throw error || new Error('Invalid user ID or password.');
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

  async function centralRequest(body) {
    const {data:sessionData} = await client.auth.getSession();
    if (!sessionData.session) throw new Error('Super Admin session is not available.');
    const res = await fetch(SUPABASE_URL + '/functions/v1/mukorob-admin', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+sessionData.session.access_token,'apikey':SUPABASE_KEY},
      body:JSON.stringify(body)
    });
    const payload=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(payload.error || 'Mukorob central administration request failed.');
    return payload;
  }

  async function refreshCompanies() {
    if(!client || A.state.auth.user?.role!=='superadmin') return [];
    try {
      const body=await centralRequest({action:'list_companies'});
      const companies=body.companies||[];
      const box=document.querySelector('#companyList');
      const select=document.querySelector('#newUserCompany');
      if(select){
        select.innerHTML='<option value="">Select company / workplace</option>';
        for(const org of companies){
          const o=document.createElement('option'); o.value=org.id; o.textContent=org.name; select.appendChild(o);
        }
      }
      if(box){
        box.innerHTML='';
        for(const org of companies){
          const row=document.createElement('div'); row.className='user-row';
          const active=org.status==='active';
          row.innerHTML='<div><strong>'+String(org.name).replace(/[&<>]/g,'')+'</strong><span>'+String(org.sector||'General').replace(/[&<>]/g,'')+' · '+(active?'ACTIVE':'INACTIVE')+'</span></div>';
          const actions=document.createElement('div'); actions.className='user-actions';
          const del=document.createElement('button'); del.className='text-btn danger'; del.textContent='Delete'; del.title='Delete company';
          del.addEventListener('click',async()=>{ if(!confirm('Delete '+org.name+'? This cannot be undone.')) return; try{A.toast('Deleting company…'); await centralRequest({action:'delete_company',organizationId:org.id}); A.toast('Company deleted.'); await refreshCompanies();}catch(e){A.toast(e.message||'Could not delete company.');} });
          actions.appendChild(del); row.appendChild(actions); box.appendChild(row);
        }
      }
      return companies;
    } catch(e) {
      console.warn('[Mukorob companies]',e);
      return [];
    }
  }

  async function createCompany() {
    const name=document.querySelector('#newCompanyName')?.value.trim();
    const sector=document.querySelector('#newCompanySector')?.value.trim() || 'General';
    if(!name) return A.toast('Enter a company / workplace name.');
    try{
      A.toast('Registering company…');
      await centralRequest({action:'create_company',name,sector});
      document.querySelector('#newCompanyName').value='';
      document.querySelector('#newCompanySector').value='';
      await refreshCompanies();
      A.toast('Company registered.');
    }catch(e){ A.toast(e.message||'Could not register company.'); }
  }


  async function refreshCentralUsers() {
    if (!client || A.state.auth.user?.role !== 'superadmin') return;
    const {data,error} = await client.from('profiles').select('id,user_id,full_name,role,active,organization_members(organization_id,permissions,active,organizations:organization_id(name))').order('user_id');
    if (error) { console.warn('[Mukorob central users]', error); return; }
    const box=document.querySelector('#userList'); if(!box) return;
    box.innerHTML='';
    for(const u of (data||[])) {
      const memberships=(u.organization_members||[]).filter(m=>m.active);
      const orgs=memberships.map(m=>m.organizations?.name).filter(Boolean).join(', ') || 'No company assigned';
      const perms=memberships[0]?.permissions||{};
      const count=Object.values(perms).filter(Boolean).length;
      const row=document.createElement('div'); row.className='user-row';
      row.innerHTML='<div><strong>'+String(u.full_name||u.user_id).replace(/[&<>]/g,'')+'</strong><span>'+String(u.user_id).replace(/[&<>]/g,'')+' · '+(u.role==='superadmin'?'Super Admin':count+' permissions')+' · '+String(orgs).replace(/[&<>]/g,'')+(u.active?'':' · DISABLED')+'</span></div>';
      box.appendChild(row);
    }
  }

  async function provisionUser() {
    const id = A.normalizeId(document.querySelector('#newUserName')?.value);
    const fullName = document.querySelector('#newUserFullName')?.value.trim();
    const password = document.querySelector('#newUserPassword')?.value;
    const role = document.querySelector('#newUserRole')?.value || 'staff';
    const organizationId = document.querySelector('#newUserCompany')?.value;
    const perms = {};
    document.querySelectorAll('#permissionChecks input').forEach(c=>perms[c.dataset.permission]=c.checked);
    if (!id || !fullName || !password || !organizationId) return A.toast('User ID, staff name, temporary password and company are required.');
    try {
      A.toast('Registering central Mukorob user…');
      const body=await centralRequest({action:'create_user',userId:id,fullName,password,role,organizationId,permissions:perms});
      await A.writeAudit('central-user-created',{targetUserId:id,organizationId});
      document.querySelector('#newUserName').value=''; document.querySelector('#newUserFullName').value=''; document.querySelector('#newUserPassword').value=''; document.querySelector('#newUserCompany').value=''; document.querySelector('#newUserRole').value='staff';
      A.toast('Central user '+id+' registered for '+body.organizationName+'.');
      if(typeof window.MukorobRefreshUsers==='function') window.MukorobRefreshUsers();
    } catch(e){ console.error(e); A.toast(e.message||'Could not register central user.'); }
  }

  function interceptUI() {
    const form = document.querySelector('#userManagementSection .user-form-grid');
    if(form && !document.querySelector('#newUserCompany')){
      const select=document.createElement('select'); select.id='newUserCompany'; select.title='Company / workplace';
      form.appendChild(select);
    }
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
    const createCompanyBtn=document.querySelector('#btnCreateCompany');
    if(createCompanyBtn && !createCompanyBtn.dataset.centralAuth){ createCompanyBtn.dataset.centralAuth='1'; createCompanyBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();createCompany();},true); }
    const refreshCompaniesBtn=document.querySelector('#btnRefreshCompanies');
    if(refreshCompaniesBtn && !refreshCompaniesBtn.dataset.centralAuth){ refreshCompaniesBtn.dataset.centralAuth='1'; refreshCompaniesBtn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();refreshCompanies();},true); }
    const logout = document.querySelector('#btnLogout');
    if (logout && !logout.dataset.centralAuth) {
      logout.dataset.centralAuth='1';
      logout.addEventListener('click', e => {
        if (A.state.auth.user?.authProvider !== 'supabase') return;
        e.stopImmediatePropagation(); e.preventDefault();
        centralLogout().catch(err=>{console.warn('[Mukorob central logout]',err); A.state.auth.user=null; A.state.auth.session=null; A.updateZoomControls(); window.dispatchEvent(new CustomEvent('mukorob:auth-changed',{detail:{user:null}}));});
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

  window.MukorobRefreshUsers = refreshCentralUsers;
  window.MukorobRefreshCompanies = refreshCompanies;
  window.MukorobSupabase = {client, centralLogin, centralLogout, restoreCentral, provisionUser, refreshCentralUsers};

  const boot = async () => {
    try { await initSupabase(); } catch (e) { console.error('[Mukorob Supabase] client load failed', e); return; }
    interceptUI();
    await restoreCentral();
    interceptUI();
    refreshCentralUsers();
    refreshCompanies();
    const userList=document.querySelector('#userList');
    if(userList && !userList.dataset.centralObserver){
      userList.dataset.centralObserver='1';
      const observer=new MutationObserver(()=>{
        if(observer._busy || A.state.auth.user?.role!=='superadmin') return;
        clearTimeout(observer._timer); observer._timer=setTimeout(()=>{ observer._busy=true; refreshCentralUsers().finally(()=>observer._busy=false); },300);
      });
      observer.observe(userList,{childList:true});
    }
    if (!A.state.auth.user) {
      const modal=document.querySelector('#authModal');
      if (modal) modal.hidden=false;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();