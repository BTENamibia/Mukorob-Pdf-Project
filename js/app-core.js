function getViewportCurrentPage() {
  if (!state.pdfDoc || !state.pageEls.length) return state.currentPage || 1;
  const viewer = $('#viewer');
  if (!viewer) return state.currentPage || 1;
  const vr = viewer.getBoundingClientRect();
  const centerY = vr.top + vr.height / 2;
  let bestPage = state.currentPage || 1;
  let bestDistance = Infinity;
  state.pageEls.forEach((p, index) => {
    if (!p?.wrap) return;
    const r = p.wrap.getBoundingClientRect();
    if (r.bottom <= vr.top || r.top >= vr.bottom) return;
    const distance = Math.abs((r.top + r.height / 2) - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPage = index + 1;
    }
  });
  return bestPage;
}

function syncCurrentPageFromViewport() {
  const page = getViewportCurrentPage();
  if (page !== state.currentPage) {
    state.currentPage = page;
    updatePageIndicator();
    highlightCurrentThumb();
  }
  return page;
}

function setupObserver() {
  if (state.observer) state.observer.disconnect();
  const viewer = $('#viewer');
  if (!viewer) return;

  state.observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const pageNum = Number(entry.target.dataset.page);
        if (entry.isIntersecting) renderPage(pageNum);
        else unrenderPage(pageNum);
      });
      syncCurrentPageFromViewport();
    },
    { root: viewer, rootMargin: '1200px 0px 1200px 0px', threshold: [0, 0.5] }
  );

  state.pageEls.forEach((p) => state.observer.observe(p.wrap));

  if (state._pageScrollHandler) viewer.removeEventListener('scroll', state._pageScrollHandler);
  let scrollTimer = null;
  state._pageScrollHandler = () => {
    if (scrollTimer) return;
    scrollTimer = requestAnimationFrame(() => {
      scrollTimer = null;
      syncCurrentPageFromViewport();
    });
  };
  viewer.addEventListener('scroll', state._pageScrollHandler, { passive: true });

  state.pageEls.forEach((p, index) => {
    if (p.wrap.dataset.currentPageWired) return;
    p.wrap.dataset.currentPageWired = '1';
    p.wrap.addEventListener('pointerdown', () => {
      state.currentPage = index + 1;
      updatePageIndicator();
      highlightCurrentThumb();
    }, { passive: true });
  });

  syncCurrentPageFromViewport();
}

async function renderPage(pageNum, force = false) {
  const p = state.pageEls[pageNum - 1];
  if (!p || (p.rendered && !force) || p.rendering) return;
  p.rendering = true;
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    // Render above CSS resolution so small text and text embedded in scanned/image PDFs
    // remain as sharp as the source permits. A high-quality cap prevents runaway memory use.