/**
 * Mukorob PDF — BTE Namibia Branding System (Issue #6)
 * 
 * FIXED: Complete branding integration
 * - Responsive logo scaling for Windows & Mobile
 * - Mukorob rock-inspired color palette
 * - Internal-only access control with invite codes
 * - Professional brand identity system
 */

const BrandingSystem = (() => {
  // Default BTE Namibia branding
  const DEFAULT_BRANDING = {
    appName: 'Mukorob PDF',
    tagline: 'Bradz Internal Workspace',
    logoUrl: 'icons/mukorob-pdf-logo.jpg',
    primaryColor: '#E2A321',    // Mukorob gold
    accentColor: '#0B4F8A',     // Mukorob navy
    backgroundColor: '#071A33', // Mukorob dusk
    surfaceColor: '#0B2342',
    textColor: '#F6F8FB',
    allowExternalAccess: false,
    inviteCodeRequired: true,
    validInviteCodes: ['BTE-2024-NAMIBIA', 'MUKOROB-INTERNAL'],
    staffNotice: 'BTE Namibia — Internal Use Only',
    companyStamp: null
  };

  const BRANDING_KEY = 'mukorob-branding';

  /**
   * Initialize branding system
   * @returns {Promise<Object>} Loaded branding config
   */
  async function initializeBranding() {
    try {
      // Load from localStorage first, then default
      const stored = localStorage.getItem(BRANDING_KEY);
      const branding = stored 
        ? JSON.parse(stored)
        : DEFAULT_BRANDING;

      // Apply branding to DOM
      applyBrandingToDom(branding);
      
      // Set CSS variables
      setCssVariables(branding);
      
      // Configure responsive logo scaling
      configureResponsiveLogos(branding);

      console.log('[Branding] System initialized:', branding.appName);
      return branding;
    } catch (err) {
      console.error('[Branding] Initialization failed:', err);
      // Fallback to default
      applyBrandingToDom(DEFAULT_BRANDING);
      setCssVariables(DEFAULT_BRANDING);
      return DEFAULT_BRANDING;
    }
  }

  /**
   * Apply branding to DOM elements
   * @private
   */
  function applyBrandingToDom(branding) {
    try {
      // Brand name & tagline
      const brandName = document.getElementById('brandName');
      const brandTag = document.getElementById('brandTag');
      
      if (brandName) {
        brandName.textContent = branding.appName || DEFAULT_BRANDING.appName;
      }
      if (brandTag) {
        brandTag.textContent = branding.tagline || DEFAULT_BRANDING.tagline;
      }

      // Logo
      const brandLogo = document.getElementById('brandLogo');
      const emptyMark = document.querySelector('.empty-mark');
      const authLogo = document.querySelector('.auth-brand img');
      
      const logoUrl = branding.logoUrl || DEFAULT_BRANDING.logoUrl;
      if (brandLogo) brandLogo.src = logoUrl;
      if (emptyMark) emptyMark.src = logoUrl;
      if (authLogo) authLogo.src = logoUrl;

      // Empty state text
      const emptyTitle = document.getElementById('emptyTitle');
      if (emptyTitle) {
        emptyTitle.textContent = branding.appName || DEFAULT_BRANDING.appName;
      }

      // Staff notice banner
      const staffNotice = document.getElementById('staffNotice');
      if (branding.staffNotice && staffNotice) {
        staffNotice.textContent = branding.staffNotice;
        staffNotice.hidden = false;
      } else if (staffNotice) {
        staffNotice.hidden = true;
      }

      // Page title
      document.title = branding.appName || DEFAULT_BRANDING.appName;

      // Meta theme color
      const themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) {
        themeColor.content = branding.primaryColor || DEFAULT_BRANDING.primaryColor;
      }

      // Auth brand text
      const authBrandText = document.querySelector('.auth-brand > div > strong');
      if (authBrandText) {
        authBrandText.textContent = branding.appName || DEFAULT_BRANDING.appName;
      }

      const authBrandTag = document.querySelector('.auth-brand > div > span');
      if (authBrandTag) {
        authBrandTag.textContent = branding.tagline || DEFAULT_BRANDING.tagline;
      }

    } catch (err) {
      console.warn('[Branding] DOM application warning:', err);
    }
  }

  /**
   * Set CSS custom properties for branding
   * @private
   */
  function setCssVariables(branding) {
    try {
      const root = document.documentElement;
      
      root.style.setProperty('--primary', branding.primaryColor || DEFAULT_BRANDING.primaryColor);
      root.style.setProperty('--accent', branding.accentColor || DEFAULT_BRANDING.accentColor);
      root.style.setProperty('--bg', branding.backgroundColor || DEFAULT_BRANDING.backgroundColor);
      root.style.setProperty('--surface', branding.surfaceColor || DEFAULT_BRANDING.surfaceColor);
      root.style.setProperty('--text', branding.textColor || DEFAULT_BRANDING.textColor);

      console.log('[Branding] CSS variables applied');
    } catch (err) {
      console.warn('[Branding] CSS variables warning:', err);
    }
  }

  /**
   * Configure responsive logo scaling
   * - Desktop: 148px × 42px (wide logo)
   * - Tablet: 112px × 38px (medium)
   * - Mobile: 30px × 30px (square icon)
   * @private
   */
  function configureResponsiveLogos(branding) {
    try {
      const style = document.createElement('style');
      style.textContent = `
        /* Desktop logo - wide format */
        @media (min-width: 1200px) {
          .brand img {
            width: 148px !important;
            height: 42px !important;
            border-radius: 7px;
            object-fit: cover;
            object-position: left center;
          }
          
          .empty-mark {
            width: min(520px, 72vw);
            height: auto;
            max-height: 180px;
            object-fit: contain;
            border-radius: 12px;
            box-shadow: 0 12px 38px rgba(0, 0, 0, 0.22);
          }
          
          .auth-brand img {
            width: 64px;
            height: 64px;
            border-radius: 13px;
            object-fit: cover;
          }
        }

        /* Tablet logo - medium format */
        @media (min-width: 720px) and (max-width: 1199px) {
          .brand img {
            width: 112px !important;
            height: 38px !important;
            border-radius: 7px;
            object-fit: cover;
            object-position: left center;
          }
          
          .empty-mark {
            width: min(400px, 65vw);
            height: auto;
            max-height: 150px;
            object-fit: contain;
            border-radius: 12px;
          }
          
          .auth-brand img {
            width: 56px;
            height: 56px;
            border-radius: 11px;
            object-fit: cover;
          }
        }

        /* Mobile logo - compact/icon format */
        @media (max-width: 719px) {
          .brand img {
            width: 32px !important;
            height: 32px !important;
            border-radius: 6px;
            object-fit: cover;
            object-position: center;
            flex: 0 0 auto;
          }
          
          .empty-mark {
            width: 100px;
            height: 100px;
            object-fit: contain;
            border-radius: 10px;
            max-height: 130px;
            margin-bottom: 16px;
          }
          
          .auth-brand img {
            width: 48px;
            height: 48px;
            border-radius: 10px;
            object-fit: cover;
            border: 1px solid rgba(226, 163, 33, 0.45);
          }
        }

        /* Ensure logo maintains aspect ratio */
        .brand img,
        .empty-mark,
        .auth-brand img {
          aspect-ratio: auto;
          display: block;
        }

        /* Print-friendly branding */
        @media print {
          .brand img,
          .empty-mark {
            box-shadow: none;
            border: 1px solid #ccc;
          }
        }
      `;
      document.head.appendChild(style);
      console.log('[Branding] Responsive logo scaling configured');
    } catch (err) {
      console.warn('[Branding] Logo scaling warning:', err);
    }
  }

  /**
   * Validate access with invite code
   * @param {string} inviteCode - Code to validate
   * @returns {boolean} Valid status
   */
  function validateInviteCode(inviteCode) {
    try {
      const branding = JSON.parse(
        localStorage.getItem(BRANDING_KEY) || JSON.stringify(DEFAULT_BRANDING)
      );

      if (!branding.inviteCodeRequired) {
        console.log('[Branding] Invite codes not required');
        return true;
      }

      if (!inviteCode || typeof inviteCode !== 'string') {
        return false;
      }

      const normalized = inviteCode.trim().toUpperCase();
      const validCodes = branding.validInviteCodes || DEFAULT_BRANDING.validInviteCodes;
      
      const isValid = validCodes.some(code =>
        code.toUpperCase() === normalized
      );

      if (!isValid) {
        console.warn('[Branding] Invalid invite code attempted');
      }

      return isValid;
    } catch (err) {
      console.error('[Branding] Invite validation failed:', err);
      return false;
    }
  }

  /**
   * Update branding configuration (Admin only)
   * @param {Object} newBranding - Partial branding object
   * @returns {boolean} Success status
   */
  function updateBranding(newBranding) {
    try {
      if (!newBranding || typeof newBranding !== 'object') {
        throw new Error('Invalid branding object');
      }

      const current = JSON.parse(
        localStorage.getItem(BRANDING_KEY) || JSON.stringify(DEFAULT_BRANDING)
      );

      const updated = { ...current, ...newBranding };
      localStorage.setItem(BRANDING_KEY, JSON.stringify(updated));
      
      // Reapply to DOM
      applyBrandingToDom(updated);
      setCssVariables(updated);

      console.log('[Branding] Configuration updated');
      return true;
    } catch (err) {
      console.error('[Branding] Update failed:', err);
      return false;
    }
  }

  /**
   * Reset branding to defaults
   * @returns {boolean} Success status
   */
  function resetBranding() {
    try {
      localStorage.removeItem(BRANDING_KEY);
      applyBrandingToDom(DEFAULT_BRANDING);
      setCssVariables(DEFAULT_BRANDING);
      console.log('[Branding] Reset to defaults');
      return true;
    } catch (err) {
      console.error('[Branding] Reset failed:', err);
      return false;
    }
  }

  /**
   * Get current branding configuration
   * @returns {Object} Current branding
   */
  function getBranding() {
    try {
      const stored = localStorage.getItem(BRANDING_KEY);
      return stored
        ? JSON.parse(stored)
        : DEFAULT_BRANDING;
    } catch (err) {
      console.warn('[Branding] Get failed:', err);
      return DEFAULT_BRANDING;
    }
  }

  /**
   * Export branding for staff installations
   * @returns {string} JSON string (ready for download)
   */
  function exportBrandingConfig() {
    try {
      const branding = getBranding();
      // Exclude internal authentication details
      const exportable = {
        appName: branding.appName,
        tagline: branding.tagline,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        backgroundColor: branding.backgroundColor,
        surfaceColor: branding.surfaceColor,
        textColor: branding.textColor,
        staffNotice: branding.staffNotice,
        companyStamp: branding.companyStamp
      };
      return JSON.stringify(exportable, null, 2);
    } catch (err) {
      console.error('[Branding] Export failed:', err);
      return '{}';
    }
  }

  /**
   * Import branding configuration
   * @param {string} jsonString - JSON configuration
   * @returns {boolean} Success status
   */
  function importBrandingConfig(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (!imported.appName) {
        throw new Error('Invalid branding configuration');
      }
      return updateBranding(imported);
    } catch (err) {
      console.error('[Branding] Import failed:', err);
      return false;
    }
  }

  return {
    initializeBranding,
    validateInviteCode,
    updateBranding,
    resetBranding,
    getBranding,
    exportBrandingConfig,
    importBrandingConfig,
    DEFAULT_BRANDING
  };
})();

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
  BrandingSystem.initializeBranding();
});
