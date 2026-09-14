/**
 * Mukorob PDF — User Isolation & Document Sharing Handler (Issue #3)
 * 
 * FIXED: Complete user-scoped document isolation
 * - Each user's documents isolated in IndexedDB
 * - Share documents with other users with personal notes
 * - Audit trail for all shares & access
 * - Granular permission control per shared document
 */

const UserIsolation = (() => {
  const DOCUMENTS_STORE = 'user-documents';
  const SHARES_STORE = 'document-shares';
  const AUDIT_STORE = 'audit-log';

  /**
   * Save document with user-scoped access
   * @param {string} userId - Current user ID
   * @param {string} docName - Document name
   * @param {ArrayBuffer} pdfBytes - PDF file bytes
   * @param {object} metadata - Optional metadata
   * @returns {Promise<Object>} Result {success, docId, error}
   */
  async function saveUserDocument(userId, docName, pdfBytes, metadata = {}) {
    try {
      if (!userId) throw new Error('User ID required');
      if (!docName || !pdfBytes) throw new Error('Document name and bytes required');

      const docId = generateDocumentId();
      const now = Date.now();

      const document = {
        docId,
        userId, // OWNER - key field for isolation
        docName: sanitizeName(docName),
        size: pdfBytes.byteLength,
        pdfBytes: pdfBytes,
        created: now,
        modified: now,
        accessCount: 0,
        isShared: false,
        sharedWith: [], // Array of userId strings
        metadata: metadata || {},
        tags: [],
        permissions: {
          view: true,
          print: true,
          download: true,
          annotate: true,
          share: true
        }
      };

      await MukorobDB.put(DOCUMENTS_STORE, document);
      await logAudit(userId, 'DOCUMENT_CREATED', docId, { docName });

      return { success: true, docId, document };
    } catch (err) {
      console.error('[UserIsolation] Save failed:', err);
      return { success: false, docId: null, error: err.message };
    }
  }

  /**
   * Share document with another user
   * @param {string} ownerId - Document owner
   * @param {string} docId - Document ID
   * @param {string} recipientId - User to share with
   * @param {string} personalNote - Optional note about share
   * @param {object} permissions - Share-specific permissions
   * @returns {Promise<Object>} Result {success, shareId, error}
   */
  async function shareDocument(
    ownerId,
    docId,
    recipientId,
    personalNote = '',
    permissions = null
  ) {
    try {
      // Validate
      if (!ownerId || !docId || !recipientId) {
        throw new Error('Owner ID, document ID, and recipient ID required');
      }
      if (ownerId === recipientId) {
        throw new Error('Cannot share with yourself');
      }

      // Verify document ownership
      const doc = await MukorobDB.get(DOCUMENTS_STORE, docId);
      if (!doc || doc.userId !== ownerId) {
        throw new Error('Document not found or not owned by user');
      }

      const shareId = generateShareId();
      const now = Date.now();

      const share = {
        shareId,
        docId,
        ownerId,
        recipientId, // User receiving the share
        personalNote: sanitizeNote(personalNote),
        permissions: permissions || {
          view: true,
          print: doc.permissions.print,
          download: doc.permissions.download,
          annotate: false, // Don't allow editing shared docs by default
          download_annotations: false
        },
        created: now,
        accessed: null,
        status: 'active', // active, revoked, expired
        expiresAt: null
      };

      await MukorobDB.put(SHARES_STORE, share);

      // Update document's shared list
      if (!doc.sharedWith) doc.sharedWith = [];
      doc.sharedWith.push(recipientId);
      doc.isShared = true;
      doc.modified = now;
      await MukorobDB.put(DOCUMENTS_STORE, doc);

      await logAudit(ownerId, 'DOCUMENT_SHARED', docId, {
        sharedWith: recipientId,
        shareId,
        note: personalNote.substring(0, 100)
      });

      return { success: true, shareId, share };
    } catch (err) {
      console.error('[UserIsolation] Share failed:', err);
      return { success: false, shareId: null, error: err.message };
    }
  }

  /**
   * Get user's own documents (isolation boundary)
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User's documents
   */
  async function getUserDocuments(userId) {
    try {
      if (!userId) return [];

      const all = await MukorobDB.getAll(DOCUMENTS_STORE);
      return all
        .filter(doc => doc.userId === userId)
        .sort((a, b) => (b.modified || 0) - (a.modified || 0));
    } catch (err) {
      console.error('[UserIsolation] Fetch user docs failed:', err);
      return [];
    }
  }

  /**
   * Get documents shared WITH the user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Shared documents with owner info
   */
  async function getSharedWithUser(userId) {
    try {
      if (!userId) return [];

      const shares = await MukorobDB.getAll(SHARES_STORE);
      const userShares = shares.filter(
        s => s.recipientId === userId && s.status === 'active'
      );

      // Enrich with document info
      const enriched = await Promise.all(
        userShares.map(async (share) => {
          const doc = await MukorobDB.get(DOCUMENTS_STORE, share.docId);
          return {
            ...share,
            docName: doc?.docName || 'Unknown',
            ownerName: doc?.userId || 'Unknown',
            size: doc?.size || 0
          };
        })
      );

      return enriched.sort((a, b) => (b.created || 0) - (a.created || 0));
    } catch (err) {
      console.error('[UserIsolation] Fetch shared docs failed:', err);
      return [];
    }
  }

  /**
   * Access shared document (with permission check)
   * @param {string} userId - Current user
   * @param {string} shareId - Share ID
   * @returns {Promise<Object>} Result {success, pdfBytes, docName, error}
   */
  async function accessSharedDocument(userId, shareId) {
    try {
      const share = await MukorobDB.get(SHARES_STORE, shareId);
      if (!share) throw new Error('Share not found');

      // Verify recipient
      if (share.recipientId !== userId) {
        throw new Error('Not authorized to access this share');
      }

      // Check expiry
      if (share.expiresAt && Date.now() > share.expiresAt) {
        share.status = 'expired';
        await MukorobDB.put(SHARES_STORE, share);
        throw new Error('Share has expired');
      }

      // Check view permission
      if (!share.permissions?.view) {
        throw new Error('View permission denied');
      }

      // Get document
      const doc = await MukorobDB.get(DOCUMENTS_STORE, share.docId);
      if (!doc) throw new Error('Document not found');

      // Update access timestamp
      share.accessed = Date.now();
      await MukorobDB.put(SHARES_STORE, share);

      await logAudit(userId, 'SHARED_DOCUMENT_ACCESSED', share.docId, {
        shareId,
        owner: share.ownerId
      });

      return {
        success: true,
        pdfBytes: doc.pdfBytes,
        docName: doc.docName,
        ownerNote: share.personalNote,
        permissions: share.permissions
      };
    } catch (err) {
      console.error('[UserIsolation] Access shared doc failed:', err);
      await logAudit(userId, 'SHARED_DOCUMENT_ACCESS_DENIED', shareId, {
        error: err.message
      });
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Revoke document share
   * @param {string} ownerId - Document owner
   * @param {string} shareId - Share ID to revoke
   * @returns {Promise<boolean>} Success status
   */
  async function revokeShare(ownerId, shareId) {
    try {
      const share = await MukorobDB.get(SHARES_STORE, shareId);
      if (!share || share.ownerId !== ownerId) {
        throw new Error('Not authorized to revoke this share');
      }

      share.status = 'revoked';
      share.modified = Date.now();
      await MukorobDB.put(SHARES_STORE, share);

      await logAudit(ownerId, 'SHARE_REVOKED', share.docId, {
        shareId,
        revokedFrom: share.recipientId
      });

      return true;
    } catch (err) {
      console.error('[UserIsolation] Revoke failed:', err);
      return false;
    }
  }

  /**
   * Get audit log for user
   * @param {string} userId - User ID
   * @param {number} limit - Max records (default 100)
   * @returns {Promise<Array>} Audit log entries
   */
  async function getAuditLog(userId, limit = 100) {
    try {
      const all = await MukorobDB.getAll(AUDIT_STORE);
      return all
        .filter(entry => entry.userId === userId)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, limit);
    } catch (err) {
      console.error('[UserIsolation] Audit log fetch failed:', err);
      return [];
    }
  }

  /**
   * Log audit event
   * @private
   */
  async function logAudit(userId, action, resourceId, details = {}) {
    try {
      const entry = {
        auditId: generateAuditId(),
        userId,
        action, // DOCUMENT_CREATED, SHARED, ACCESSED, REVOKED, etc.
        resourceId,
        details,
        timestamp: Date.now(),
        userAgent: navigator.userAgent.substring(0, 255)
      };

      await MukorobDB.put(AUDIT_STORE, entry);

      // Cleanup old audit logs (keep 1 year)
      const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
      const allAudit = await MukorobDB.getAll(AUDIT_STORE);
      for (const oldEntry of allAudit) {
        if (oldEntry.timestamp < oneYearAgo) {
          await MukorobDB.del(AUDIT_STORE, oldEntry.auditId);
        }
      }
    } catch (err) {
      console.warn('[UserIsolation] Audit log failed:', err);
    }
  }

  /**
   * Helper: Generate unique document ID
   * @private
   */
  function generateDocumentId() {
    return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Helper: Generate unique share ID
   * @private
   */
  function generateShareId() {
    return 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Helper: Generate unique audit ID
   * @private
   */
  function generateAuditId() {
    return 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Sanitize document name
   * @private
   */
  function sanitizeName(name) {
    return String(name || 'document')
      .replace(/[<>:"|?*\/]/g, '_')
      .substring(0, 255);
  }

  /**
   * Sanitize personal note
   * @private
   */
  function sanitizeNote(note) {
    return String(note || '')
      .substring(0, 5000)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Check if user can access document
   */
  async function canAccessDocument(userId, docId) {
    try {
      // Check if owned
      const doc = await MukorobDB.get(DOCUMENTS_STORE, docId);
      if (doc?.userId === userId) return true;

      // Check if shared
      const shares = await MukorobDB.getAll(SHARES_STORE);
      const share = shares.find(
        s => s.docId === docId && s.recipientId === userId && s.status === 'active'
      );

      return !!share && share.permissions?.view;
    } catch (err) {
      console.error('[UserIsolation] Access check failed:', err);
      return false;
    }
  }

  return {
    saveUserDocument,
    shareDocument,
    getUserDocuments,
    getSharedWithUser,
    accessSharedDocument,
    revokeShare,
    getAuditLog,
    canAccessDocument
  };
})();
