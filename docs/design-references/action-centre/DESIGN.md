---
name: Precision Ledger Operations
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464555'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#005338'
  on-tertiary: '#ffffff'
  tertiary-container: '#006e4c'
  on-tertiary-container: '#7df1bd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.005em
  mono-data-lg:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  mono-data-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.005em
  mono-data-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

The design system establishes a high-density, authoritative visual language tailored for institutional financial operations, risk oversight, and transaction reconciliation. Its visual personality is rigorous, dispassionate, and ultra-crisp. Users operate in mission-critical environments where split-second comprehension, precise data scanning, and clear confirmation states take precedence over decorative flair.

Drawing from modern high-density corporate minimalism and technical workstation patterns, the interface balances strict spatial efficiency with human readability. Visual stress is minimized by grounding interactions on a cool, anti-glare canvas, while high-contrast ink levels ensure instant scanability across dense figures, audit trails, and multi-column ledger tables.

## Colors

The palette relies on deliberate contrast boundaries and functional chromatic signals:

- **Canvas & Structural Surfaces:**
  - Base Application Canvas: `#F8FAFC` (Slate 50) provides a soft, low-glare working layer.
  - Surface Containers: `#FFFFFF` (Pure White) defines interactive cards, comparative tables, and operational panels.
  - Structural Divider / Border: `#E2E8F0` (Slate 200) sets crisp boundaries without harsh visual clutter.
  - Subtle Fill / Table Alternation: `#F1F5F9` (Slate 100) separates table headers, hover rows, and read-only inputs.

- **Monochrome Typography (Ink Hierarchy):**
  - Primary Ink: `#0F172A` (Slate 900) for titles, active data points, numerical values, and column keys.
  - Secondary Ink: `#334155` (Slate 700) for labels, table column headers, and secondary body details.
  - Muted / Supporting Ink: `#64748B` (Slate 500) for metadata, timestamps, helper text, and inactive iconography.

- **Operational & Action Accents:**
  - Primary Action Base: `#4F46E5` (Indigo 600) for primary buttons, focus highlights, and active operational states.
  - Primary Action Hover/Active: `#4338CA` (Indigo 700) for depressed interaction states.
  - Primary Accent Soft: `#EEF2FF` (Indigo 50) for selected row highlights and primary badge backgrounds.

- **Status & Risk Semantics (Paired Tokens):**
  - Success / Reconciled: `#059669` (Emerald 600) foreground over `#D1FAE5` (Emerald 100) background.
  - Warning / Under Review: `#D97706` (Amber 600) foreground over `#FEF3C7` (Amber 100) background.
  - Critical / Block / Discrepancy: `#E11D48` (Rose 600) foreground over `#FFE4E6` (Rose 100) background.

## Typography

The type scale combines `Geist` for structural UI controls and structural hierarchy with `JetBrains Mono` for tabular figures, audit trails, account identifiers, and financial values.

- Numerical Data & Currency: All transactional balances, delta percentages, timestamps, and account keys must be rendered with `JetBrains Mono` using tabular numerals (`tnum`) to maintain exact horizontal alignment across audit columns.
- Density Adaptations: Body text is calibrated to 13px base sizing to accommodate expansive multi-column financial dashboards without horizontal clipping.
- Labeling: Section labels and column categorizations use `label-caps` in uppercase format to cleanly separate contextual descriptors from primary data payloads.

## Layout & Spacing

The layout is constructed around an operational fluid grid with strict mathematical alignment rules designed to maximize horizontal dashboard utility:

- Grid Architecture: A 12-column layout desktop structure with default gutters set to `1rem` (16px) and an optional high-density mode utilizing `0.5rem` (8px) gutters for comparison workspaces. Outer canvas margins sit fixed at `1.5rem` (24px) on desktop and collapse to `1rem` (16px) below 768px.
- Vertical Rhythm: Based on a strict 4px base increment. Data tables prioritize 32px to 40px row heights to maximize visible line items per viewport without causing misclicks.
- Comparative Tables & Splits: Two-up split layouts (e.g., Target vs. Actual, Before vs. After) divide at 50/50 with a mandatory vertical border separator (`#E2E8F0`) and `space-md` inner cell padding.
- Responsive Behavior: Below 1024px, comparative data sets shift from dual-column side-by-side viewports to stacked accordions retaining horizontal ledger alignment internally.

## Elevation & Depth

This system avoids heavy drop shadows and ornamental diffusion, utilizing low-contrast boundaries and disciplined surface contrast:

- **Flat Layering via Micro-Borders:** Surfaces rely on 1px solid borders (`#E2E8F0`) over `#FFFFFF` panels to dictate elevation against the `#F8FAFC` base canvas.
- **Ambient Floor Shadow:** A single, barely perceptible ambient drop shadow is reserved for floating contextual menus, popovers, and operational modals: `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 4px 6px -1px rgba(15, 23, 42, 0.03)`.
- **Active Selection & Modals:** Overlay planes use a semi-translucent backdrop veil (`rgba(15, 23, 42, 0.4)`) paired with crisp white containers bordered with `#CBD5E1`.
- **Data Depth:** Depth in complex records is indicated by inner indentation and background contrast shifts (e.g., `#F8FAFC` inner recessed audit blocks nested within white card surfaces) rather than cast shadows.

## Shapes

The visual geometry is defined by `Soft (1)` rounding principles to preserve a precise, engineered terminal look:

- Default Inputs, Buttons, & Tags: Standardized at `0.25rem` (4px). This minimal radius maximizes available visual interior space for monospaced figures and prevents interfaces from appearing casual.
- Surface Cards & Tables: External outer bounds utilize `rounded-lg` (`0.5rem` / 8px) with strict internal content clipping (`overflow: hidden`) so table cells seamlessly abut corners.
- Status Chips & Badges: Fixed at `0.25rem` (4px) to retain an architectural, data-tag identity. Pill shapes (`rounded-full`) are strictly reserved for avatar initials and live-status indicator dots (e.g., 6px circular pulse beacons).

## Components

- **Buttons:**
  - *Primary Action:* `#4F46E5` background, white text, 32px standard height (compact), 4px border radius. Hover state is `#4338CA`.
  - *Secondary / Neutral:* White background, 1px border (`#E2E8F0`), `#334155` text. Hover shifts background to `#F8FAFC` with border `#CBD5E1`.
  - *Destructive / Reject:* White background with `#E11D48` text and `#FFE4E6` border; hover transitions to `#E11D48` solid background with white text.

- **Before/After Comparative Tables:**
  - Dual-pane side-by-side visual mapping.
  - "Before" columns use neutral slate styling (`#64748B` typography, `#F8FAFC` zebra fills).
  - "After" columns highlight discrepancies using state fills: changed cells take a 1px dashed `#4F46E5` outline, value deletions take a subtle `#FFE4E6` background with strikethrough typography, and incoming inserts take `#D1FAE5`.
  - Column headers sit on `#F1F5F9` backgrounds using `label-caps` in `#334155`.

- **Financial Ledger & Audit Rows:**
  - Tight vertical spacing with 36px standard row height.
  - Alternating subtle row zebra backgrounds (`#FFFFFF` to `#F8FAFC`).
  - Right-aligned numeric values using `mono-data-md`.
  - Hover state highlights row in `#EEF2FF` (Indigo 50) with an active 2px left border marker (`#4F46E5`).

- **Input Fields & Search Bars:**
  - Base: Height 32px (compact), `#FFFFFF` fill, 1px solid `#E2E8F0` border, `body-md` typography.
  - Active/Focus: Border transitions to `#4F46E5` with a 1px ring outline (`rgba(79, 70, 229, 0.15)`).
  - Monospaced inputs for account numbers, transaction hashes, and currency amounts.

- **Status Badges & Chips:**
  - Height 20px, 4px border-radius, horizontal padding `space-xs`.
  - Constructed using semantic pairings: Success uses `#D1FAE5` background with `#059669` text; Review uses `#FEF3C7` background with `#D97706` text; Critical uses `#FFE4E6` background with `#E11D48` text. Typography is set in `mono-data-sm`.

- **Compact Action Cards:**
  - `#FFFFFF` background with 1px border in `#E2E8F0`.
  - Header band cleanly delineated by a 1px bottom border, housing action triggers and summary totals.
  - Metrics cards feature a top 2px primary accent bar to designate active reconciliation streams.