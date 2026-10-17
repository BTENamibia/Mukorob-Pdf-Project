# Mukorob PDF 0.10.0 validation

Developer: Bradz Trading Enterprises CC

## Fix

Zoom previously started forced, high-resolution renders for every rendered page on each input. The final renderer also waited up to five seconds for an earlier render and did not skip completed unchanged pages. The new path applies CSS dimensions immediately, waits 140 ms after the last zoom event before sharpening nearby pages, cancels superseded work, and limits simultaneous page renders to two. Completed bitmaps remain visible during replacement rendering. A 6 MP mobile / 12 MP desktop pixel budget bounds each bitmap; actual resolution follows device pixel ratio.

## Added controls and workflows

- Direct zoom percentage on desktop and mobile (30–400%).
- Ctrl/Cmd-wheel zoom around the pointer; native keyboard zoom is suppressed for app zoom shortcuts.
- Pinch zoom around the touch midpoint; reading-position anchoring where scroll bounds permit.
- Hand panning for mouse/pen; native touch scrolling retained.
- Mixed-size page dimensions retained across zoom.
- Combine PDFs with explicit file ordering, and extract a validated range from the current edited PDF, both saving a separate copy.
- Combine/extract flatten interactive form values in the output; original files remain editable.

## Validation

- `npm test`: structural, document-engine, annotation geometry and draft recovery checks passed.
- Full existing and initial zoom suite: 42 desktop/mobile browser tests passed.
- Expanded zoom suite: 10 desktop/mobile tests passed, including two additional pinch/cancellation/annotation tests (44 distinct browser checks across the suites).
- Rapid 16-step zoom preview on a generated 12-page text PDF took approximately 7–12 ms in the local headless browser. This measures synchronous preview only, not completion of high-resolution rendering, and is not a physical Android-device benchmark.
- Browser checks include zoom bounds, bitmap retention and budgets, nearby-page rendering, percentage entry, Ctrl-wheel, hand tool, mixed page sizes, anchor drift, close during pending work, form filling, output page counts, unchanged sources, annotations, offline opening and legacy update recovery.
- Chromium desktop and Pixel 7 viewport/touch emulation were used; physical Windows/Android validation remains advisable.

## Remaining feature scope

This release is not full Adobe Acrobat parity. OCR, editing existing PDF text/images, Office conversion, secure redaction, certificate signatures, PDF/A validation, accessibility remediation and cloud collaboration are not implemented by this update. Existing branding, accounts, browser-local PDFs, drafts and settings are retained.
