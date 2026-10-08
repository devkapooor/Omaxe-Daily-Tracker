# AlphaHub Design System

## Product identity

AlphaHub is a single-store financial operations workspace. Its interface should feel dependable, precise, calm, and efficient. Prioritize legibility and clear hierarchy over decoration. This file describes visual language and reusable UI patterns; it does not define or change product workflows or financial rules.

## Design principles

- Preserve the existing AlphaHub application shell and page navigation when designing an individual screen.
- Keep operational information compact but comfortably readable. Use whitespace to group related information, not to create large empty areas.
- Use semantic color, typography, spacing, and component patterns consistently across pages and themes.
- Make financial amounts, dates, statuses, warnings, and audit context easy to distinguish. Never rely on color alone to communicate meaning.
- Prefer restrained surfaces, thin borders, and subtle shadows. Avoid decorative gradients, ornamental charts, or invented metrics.
- Use clearly illustrative sample data only. Do not reproduce private or real financial information from screenshots.

## Typography

| Role | Font | Use |
| --- | --- | --- |
| Interface and body | Hanken Grotesk, then Segoe UI/system sans-serif | Navigation, labels, body copy, controls |
| Headings | Hanken Grotesk, then Segoe UI/system sans-serif | Page and section headings; semibold or bold |
| Numeric/data | JetBrains Mono, then ui-monospace | Numeric inputs, identifiers, and values where alignment aids comparison |

The browser root size is 16px. Common interface text is compact (roughly 12–14px) with strong contrast; page and section titles should remain visibly larger than labels. Eyebrows use uppercase text, muted color, and modest letter spacing.

## Color tokens

Use semantic tokens rather than hard-coded colors. Light and dark modes share semantic roles, not identical raw values.

| Token / purpose | Light | Dark |
| --- | --- | --- |
| Background | `#f8f9ff` | `#051424` |
| Foreground | `#0b1c30` | `#d4e4fa` |
| Card | `#ffffff` | `#0d1c2d` |
| Card foreground | `#0b1c30` | `#d4e4fa` |
| Popover | `#ffffff` | `#122131` |
| Primary | `#2563eb` | `#3b82f6` |
| Primary foreground | `#ffffff` | `#ffffff` |
| Secondary | `#eff4ff` | `#1c2b3c` |
| Muted | `#f1f5f9` | `#122131` |
| Muted foreground | `#64748b` | `#a7b6ca` |
| Accent | `#eff6ff` | `#1c2b3c` |
| Destructive | `#e11d48` | `#ffb4ab` |
| Success | `#059669` | `#34d399` |
| Warning | `#d97706` | `#fbbf24` |
| Information | `#0369a1` | `#5de6ff` |
| Border | `#e2e8f0` | `#273647` |
| Input border | `#cbd5e1` | `#464554` |
| Focus ring | `#2563eb` | `#5de6ff` |

Use success, warning, destructive, and information colors only for their semantic states. In dark mode, keep surfaces distinct from the page background and status text bright enough to read. Do not introduce extra color meanings without documenting them.

## Layout and responsive behavior

- The app is a full-viewport workspace with independently scrollable content panels; avoid introducing a second browser-like page scrollbar where the shell already owns scrolling.
- Expanded desktop navigation is approximately 260px wide; collapsed navigation is approximately 72px. The sidebar has a compact brand header, grouped navigation, active-page emphasis, and a footer containing the theme toggle and user controls.
- On narrower screens, retain the existing compact top header and off-canvas navigation drawer. Adapt the same content and actions; do not invent mobile-only features or separate workflows.
- Use the existing responsive breakpoints: `sm` at about 640px and `xl` at about 1280px. Keep forms and comparisons stacked when space is limited; allow wide tables to scroll within their own container.
- Shared page content uses compact, consistent horizontal gutters and small gaps between related sections. Preserve the current top-bar position and spacing unless the user approves a change.
- Respect safe areas, keyboard focus, reduced-motion preferences, and forced-colors accessibility settings.

## Surfaces, spacing, and shape

- Cards and sections: white/light or layered dark surfaces, 1px semantic border, subtle shadow, approximately 6px corner radius.
- Controls: compact and aligned; standard buttons and inputs are approximately 36px high, small buttons about 32px, and large buttons about 40px.
- Buttons: primary blue for the main action, outline for secondary actions, ghost for low-emphasis navigation, destructive for irreversible or rejecting actions. Maintain visible focus and disabled states.
- Badges: small, concise, semantic status labels; do not use a badge as the only indication of a critical state.
- Inputs: clear labels, semantic borders, quiet placeholders, visible focus ring, and readable validation/disabled states.
- Use a consistent spacing rhythm based on 4px increments. Prefer tight section gaps (8–12px) and modest card padding; allow more space around high-risk decisions and important summaries.

## Shared component patterns

Map designs to these existing reusable patterns where appropriate:

- `Card`, `CardHeader`, and `CardContent`: grouped page content and metrics.
- `SectionHeading`: eyebrow, section title, and optional short description.
- `Button`: primary, secondary, outline, ghost, and destructive actions.
- `Badge`: concise status and category labels.
- `Input`, `SelectField`, and `Textarea`: labeled forms and filters.
- `Tabs`: compact navigation between related views.
- `StatusPanel`: information, success, warning, and error notices.
- `Table`: dense structured data inside a horizontally scrollable boundary when needed.
- Confirmation dialogs and toasts: deliberate confirmation for consequential actions and concise operation feedback.

Create page-specific components only where behavior or information structure is unique. Reuse patterns when behavior repeats; do not force different financial workflows into one generic mega-form.

## Interaction and accessibility

- Ensure keyboard-visible focus, semantic control labels, sufficient contrast, and touch-friendly targets.
- Use confirmation and clear consequence text for financial decisions; include reasons where the existing workflow requires them.
- Provide intentional loading, empty, error, disabled, stale/blocked, and success states when relevant.
- Keep motion subtle and honor `prefers-reduced-motion`. Scrollbars are thin, translucent blue, and unobtrusive while remaining discoverable; retain system behavior in forced-colors mode.

## Product and data boundaries

- A visual design must not invent or change data, calculations, financial meanings, permissions, statuses, or business rules. Mark new feature ideas separately for approval.
- Production financial records are protected; design previews use illustrative data only.
- Loans are strictly out of scope: do not show, modify, calculate, or redesign loan-related data, logic, workflows, permissions, or UI. Stop and ask before any request or shared refactor could affect loans.
- Keep Quick Jump absent. Preserve approved application navigation and existing user workflows.
