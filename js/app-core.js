function setupObserver() {
  if (state.observer) state.observer.disconnect();
  const viewer = $('#viewer');

  // The IntersectionObserver callback can contain several pages at once when
  // the viewer is scrolled quickly. Taking the last entry as "current" made
  // rotation act on a neighbouring page rather than the page actually under
  // the user's viewport. Current page is therefore derived from the page
  // whose centre is closest to the viewer's visible centre.
  function updateCurrentPageFromViewport() {
    if (!viewer || !state.pageEls.length) return;
    const vr = viewer.getBoundingClientRect();
    const centerY = vr.top + vr.height / 2;
    let bestPage = state.currentPage || 1;
    let bestDistance = Infinity;

    state.pageEls.forEach((p, index) => {
      const r = p.wrap.getBoundingClientRect();
      if (r.bottom <= vr.top || r.top >= vr.bottom) return;
      const pageCenter = r.top + r.height / 2;
      const distance = Math.abs(pageCenter - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = index + 1;
      }
    });

    if (bestPage !== state.currentPage) {
      state.currentPage = bestPage;
      updatePageIndicator();
      highlightCurrentThumb();
    }
  }

  state._updateCurrentPageFromViewport = updateCurrentPageFromViewport;

  state.observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const pageNum = Number(entry.target.dataset.page);
        if (entry.isIntersecting) {
          renderPage(pageNum);
        } else {
          unrenderPage(pageNum);
        }
      });
      updateCurrentPageFromViewport();
    },
    { root: viewer, rootMargin: '1200px 0px 1200px 0px', threshold: [0, 0.5] }
  );

  state.pageEls.forEach((p) => state.observer.observe(p.wrap));

  // Keep the active page synchronized continuously while the user scrolls.
  // This is the value used by rotate, delete, annotate, sign and stamp tools.
  if (state._pageScrollHandler) viewer.removeEventListener('scroll', state._pageScrollHandler);
  let scrollTimer = null;
  state._pageScrollHandler = () => {
    if (scrollTimer) return;
    scrollTimer = requestAnimationFrame(() => {
      scrollTimer = null;
      updateCurrentPageFromViewport();
    });
  };
  viewer.addEventListener('scroll', state._pageScrollHandler, { passive: true });
  updateCurrentPageFromViewport();
}

async function renderPage(pageNum, force = false) {
  const p = state.pageEls[pageNum - 1];
  if (!p || (p.rendered && !force) || p.rendering) return;
  p.rendering = true;
  try {
    const page = await state.pdfDoc.getPage(pageNum);
    // Render above CSS resolution so small text and text embedded in scanned/image PDFs
    // remain as sharp as the source permits. A high-quality cap prevents runaway memory use.