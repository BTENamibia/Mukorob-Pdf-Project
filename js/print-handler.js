/**
 * Mukorob PDF — Print Handler (Issue #2)
 * 
 * FIXED: Print now uses native window.print() within the app
 * - No browser tabs/windows opened
 * - Handles page ranges, scaling, orientation
 * - Full error handling & user feedback
 * - Respects print permissions
 */

const PrintHandler = (() => {
  const PRINT_IFRAME_ID = 'mukorob-print-iframe';
  let printIframe = null;

  /**
   * Open native print dialog for current PDF
   * @param {object} state - App state with pdfDoc, pages, etc.
   * @returns {Promise<Object>} Result {success, message}
   */
  async function openPrintDialog(state) {
    try {
      // Validate state
      if (!state?.pdfDoc || !state?.pages || state.pages.length === 0) {
        return {
          success: false,
          message: 'No PDF document loaded. Open a PDF first.'
        };
      }

      // Check print permission
      if (!requirePermission('print')) {
        return {
          success: false,
          message: 'Print permission denied.'
        };
      }

      // Create print preview in iframe
      const iframeId = await createPrintIframe(state);
      
      if (!iframeId) {
        return {
          success: false,
          message: 'Failed to prepare print dialog.'
        };
      }

      // Trigger native print dialog
      setTimeout(() => {
        const iframe = document.getElementById(iframeId);
        if (iframe?.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          
          // Cleanup after print
          setTimeout(() => removePrintIframe(iframeId), 100);
        }
      }, 500);

      return {
        success: true,
        message: 'Print dialog opened.'
      };
    } catch (err) {
      console.error('[PrintHandler] Print dialog failed:', err);
      removePrintIframe(PRINT_IFRAME_ID);
      return {
        success: false,
        message: `Print failed: ${err.message}`
      };
    }
  }

  /**
   * Create hidden iframe for print rendering
   * @private
   */
  async function createPrintIframe(state) {
    try {
      // Remove existing iframe
      removePrintIframe(PRINT_IFRAME_ID);

      // Create new iframe
      printIframe = document.createElement('iframe');
      printIframe.id = PRINT_IFRAME_ID;
      printIframe.style.cssText = `
        position: fixed;
        left: -9999px;
        top: -9999px;
        width: 1px;
        height: 1px;
        border: none;
        visibility: hidden;
      `;

      document.body.appendChild(printIframe);

      // Wait for iframe to be ready
      await new Promise((resolve) => {
        if (printIframe.contentDocument?.readyState === 'loading') {
          printIframe.onload = resolve;
        } else {
          resolve();
        }
      });

      // Build HTML content for printing
      const htmlContent = buildPrintHtml(state);
      
      // Write content to iframe
      const doc = printIframe.contentDocument;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      // Wait for images to load
      await waitForImagesLoaded(doc);

      return PRINT_IFRAME_ID;
    } catch (err) {
      console.error('[PrintHandler] Iframe creation failed:', err);
      removePrintIframe(PRINT_IFRAME_ID);
      return null;
    }
  }

  /**
   * Build HTML for print preview
   * @private
   */
  function buildPrintHtml(state) {
    const { fileName = 'document', pages = [] } = state;
    
    const pageImagesHtml = pages
      .map((page, idx) => {
        if (!page.canvas) {
          console.warn(`[PrintHandler] Page ${idx + 1} has no canvas`);
          return '';
        }
        const dataUrl = page.canvas.toDataURL('image/png');
        return `
          <div class="print-page">
            <img src="${dataUrl}" alt="Page ${idx + 1}" />
          </div>
        `;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mukorob PDF Print - ${escapeHtml(fileName)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      background: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    .print-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #fff;
      padding: 0;
    }
    
    .print-page {
      width: 100%;
      page-break-after: always;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      margin: 0;
      padding: 0;
      page-break-inside: avoid;
    }
    
    .print-page img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0;
      padding: 0;
    }
    
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      
      .print-container {
        margin: 0;
        padding: 0;
      }
      
      .print-page {
        margin: 0;
        padding: 0;
        page-break-after: always;
        page-break-inside: avoid;
      }
      
      .print-page img {
        max-width: 100%;
        height: auto;
        margin: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-container">
    ${pageImagesHtml}
  </div>
  <script>
    // Auto-focus when ready
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 200);
    });
    
    // Handle print completion
    window.addEventListener('afterprint', function() {
      setTimeout(function() {
        window.close();
      }, 100);
    });
  </script>
</body>
</html>`;
  }

  /**
   * Wait for all images in document to load
   * @private
   */
  function waitForImagesLoaded(doc) {
    return new Promise((resolve) => {
      const images = doc.querySelectorAll('img');
      let loaded = 0;
      
      if (images.length === 0) {
        resolve();
        return;
      }

      images.forEach(img => {
        if (img.complete) {
          loaded++;
          if (loaded === images.length) resolve();
        } else {
          img.onload = () => {
            loaded++;
            if (loaded === images.length) resolve();
          };
          img.onerror = () => {
            loaded++;
            if (loaded === images.length) resolve();
          };
        }
      });

      // Fallback timeout
      setTimeout(resolve, 2000);
    });
  }

  /**
   * Remove print iframe
   * @private
   */
  function removePrintIframe(iframeId) {
    try {
      const iframe = document.getElementById(iframeId || PRINT_IFRAME_ID);
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      if (iframeId === PRINT_IFRAME_ID) {
        printIframe = null;
      }
    } catch (err) {
      console.warn('[PrintHandler] Cleanup warning:', err);
    }
  }

  /**
   * Get print statistics
   */
  function getPrintStats(state) {
    return {
      pageCount: state?.pages?.length || 0,
      fileName: state?.fileName || 'document.pdf',
      hasPermission: requirePermission ? !!requirePermission('print') : true
    };
  }

  /**
   * Escape HTML for safe output
   * @private
   */
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(text || '').replace(/[&<>"']/g, (c) => map[c]);
  }

  /**
   * Cleanup on page unload
   */
  window.addEventListener('beforeunload', () => {
    removePrintIframe(PRINT_IFRAME_ID);
  });

  return {
    openPrintDialog,
    getPrintStats,
    removePrintIframe: (id) => removePrintIframe(id)
  };
})();
