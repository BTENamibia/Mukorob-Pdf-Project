/* Mukorob PDF v0.7.1 — branding + mobile authentication corrective layer.
   Keeps the same authentication UI on desktop and mobile/PWA. */
(() => {
  const A = window.MukorobApp;
  if (!A) return;
  const $ = (s) => document.querySelector(s);

  function applyBranding() {
    const s = A.state?.settings || {};
    const header = s.logo || 'icons/mukorob-pdf-logo.jpg';
    const dashboard = s.dashboardLogo || header;
    const loginIcon = s.loginIconLogo || header;
    const loginBg = s.loginBackgroundLogo || header;

    const brand = $('#brandLogo');
    const empty = $('.empty-mark');
    if (brand) brand.src = header;
    if (empty) empty.src = dashboard;

    document.querySelectorAll('#authModal .auth-brand img, #accessGate .auth-brand img').forEach((img) => {
      img.src = loginIcon;
    });
    document.querySelectorAll('#authModal .auth-card, #accessGate .auth-card').forEach((card) => {
      if (loginBg) {
        card.style.backgroundImage = `linear-gradient(rgba(5,18,36,.88),rgba(5,18,36,.94)),url("${loginBg}")`;
        card.style.backgroundSize = 'cover';
        card.style.backgroundPosition = 'center';
      }
    });
  }

  function ensureMobileAuth() {
    const modal = $('#authModal');
    const gate = $('#accessGate');
    if (!modal) return;
    const loggedIn = !!A.state?.auth?.user;
    if (loggedIn) {
      if (!modal.hidden) modal.hidden = true;
      return;
    }
    /* The existing core auth flow owns bootstrap/forgot-password state.
       This layer only makes the same sign-in surface available in a PWA/mobile viewport. */
    if (gate && !gate.hidden) return;
    modal.hidden = false;
    const login = $('#loginView');
    const forgot = $('#forgotView');
    if (forgot && !login) forgot.hidden = true;
  }

  function install() {
    applyBranding();
    ensureMobileAuth();
    window.addEventListener('mukorob:settings-applied', applyBranding);
    window.addEventListener('mukorob:auth-changed', () => {
      applyBranding();
      ensureMobileAuth();
    });
    window.addEventListener('mukorob:document-opened', applyBranding);
    window.addEventListener('resize', ensureMobileAuth);
    const observer = new MutationObserver(() => {
      applyBranding();
      if (window.innerWidth <= 900) ensureMobileAuth();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { applyBranding(); ensureMobileAuth(); }, 500);
    setTimeout(() => { applyBranding(); ensureMobileAuth(); }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
