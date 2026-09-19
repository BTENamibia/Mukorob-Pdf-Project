# Mukorob PDF — Acrobat-class feature parity plan

Mukorob PDF will target the **capability level** of a modern professional PDF suite while preserving the stable local-first v0.7.x core.

## Important implementation rule

Mukorob PDF will **not copy or reproduce Adobe Acrobat's proprietary source code, private implementation, binaries, or internal APIs**. The engineering target is equivalent user-facing capability implemented independently with open standards, PDF.js/pdf-lib, and—where browser APIs are insufficient—a future Mukorob native PDF engine.

## Capability map

### Already present in the v0.7.x core
- PDF viewing and high-DPI rendering
- text selection/search
- page navigation, zoom and fit modes
- accurate per-page rotation
- printing
- annotations and drawing
- e-signature placement/export
- company stamp placement/export
- page organiser: reorder, duplicate, delete
- autosave/draft recovery
- Recent document storage
- user-scoped local data
- Super Admin/staff accounts and permissions
- local audit log
- encrypted Backup & Migration
- PWA installation/update workflow

### Phase A — document workflow
- Create PDF from images and supported documents
- Merge/combine PDFs
- Split/extract page ranges
- Insert pages from another PDF
- Replace pages
- Rotate selected/all pages
- Crop pages
- Page labels and numbering
- Bookmarks/outlines
- Attachments
- Document properties and metadata
- Headers/footers
- Watermarks/backgrounds
- Bates numbering
- Save a new version / Save As
- PDF compression and optimisation

### Phase B — editing and forms
- Edit existing text where the PDF content model permits
- Add/delete/replace images
- Add shapes, lines, arrows and text boxes
- Find/replace text
- Link creation/editing
- Form-field creation and editing
- Fill AcroForm fields
- Form validation
- Import/export form data
- Flatten forms
- Fill & Sign workflow
- reusable signature/initials
- comments, replies and review status
- stamps and custom stamp library

### Phase C — document intelligence and security
- OCR for scanned PDFs
- searchable OCR text layer
- language packs
- automatic document classification
- redact content
- redact metadata
- sanitise hidden content
- password protection
- permissions restrictions
- AES-based PDF encryption
- certificate-based signatures
- signature validation
- trusted certificate store
- compare two PDF versions
- accessibility inspection and tagging
- PDF/A validation/conversion
- print-production/preflight checks

### Phase D — conversion and creation
- PDF to Word
- PDF to Excel
- PDF to PowerPoint
- PDF to images
- images to PDF
- Office/document to PDF
- HTML/web page to PDF
- scan-to-PDF
- OCR-to-PDF
- optimise for web
- PDF portfolio/package workflows

### Phase E — collaboration and cloud
- shared document workspace
- document version history
- comments/review invitations
- controlled sharing
- access expiry
- download/print/copy policies
- server-side audit trail
- account revocation
- central authentication
- organisation/team workspaces
- cloud document storage
- offline/online conflict handling

### Phase F — Mukorob intelligence
- natural-language document Q&A
- summarisation
- key-point extraction
- clause/risk detection
- document comparison explanations
- data extraction into structured tables
- workflow automation
- organisation knowledge controls
- AI privacy and retention controls

## Engineering order

1. Protect the existing viewer/rotation/annotation/organiser/autosave core.
2. Complete document workflow tools using pdf-lib where safe.
3. Add forms and richer annotation/editing primitives.
4. Introduce OCR as a separate worker/service so large scans do not block the viewer.
5. Add secure redaction, encryption and true cryptographic signatures.
6. Introduce the Mukorob native PDF engine for capabilities that cannot be implemented safely in browser JavaScript.
7. Add central Supabase-backed identity, storage, sharing and audit.
8. Add conversion/office integrations.
9. Add Mukorob AI capabilities.

## Regression rule

No Acrobat-parity feature is considered complete if it breaks an existing v0.7.x workflow. Every major feature must have structural tests and browser regression coverage before release.

## Current release

v0.7.3 focuses on the new Mukorob visual identity and app icon. The next feature releases should be built incrementally from this stable base rather than replacing the working viewer with a parallel runtime layer.
