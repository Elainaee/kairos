---
name: Kairos Claude Plus
colors:
  background: '#FBF9F2'
  surface: '#FBF9F2'
  surface-raised: '#FFFFFF'
  surface-subtle: '#F5F4ED'
  secondary: '#E8E3D0'
  muted: '#EBE6D6'
  foreground: '#3D3B2E'
  text-strong: '#1B1C18'
  text-muted: '#676556'
  primary: '#9E3D19'
  accent-terracotta: '#D1633C'
  on-primary: '#FFFFFF'
  tertiary: '#00666F'
  border: '#DED8CF'
  input: '#C3BDB3'
  success: '#477054'
  warning: '#A36316'
  danger: '#B3261E'
  info: '#3F6F9E'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-compact:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 1.2
    letterSpacing: -0.01em
  title-md:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 1.4
  body-lg:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 1.6
  body-md:
    fontFamily: Outfit
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 1.6
  label-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 1
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 1
rounded:
  sm: 0.5rem
  DEFAULT: 0.75rem
  md: 1rem
  lg: 1.25rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-compact: 16px
  margin-desktop: 32px
---

# Design System: Kairos Claude Plus

## 1. Visual Theme & Atmosphere

Kairos uses a warm editorial desktop aesthetic inspired by paper, personal planners, and carefully made creative tools. Bone-white and cream surfaces create a calm canvas; terracotta accents identify meaningful action and current state. Outfit typography, softly rounded geometry, fine warm-gray borders, and restrained elevation keep the product personal without becoming decorative or childish.

The interface is compact but breathable. Calendar, Schedule, and Habits may carry significant information density, while Music, AI Chat, and the desktop pet may introduce more expressive details. All areas must still feel like one application: warm, crafted, calm, useful, and distinctly unlike a generic blue SaaS dashboard or neon AI product.

## 2. Color Palette & Roles

### Primary Foundation

- **Warm Paper** `#FBF9F2` — application canvas and page background.
- **Raised Porcelain** `#FFFFFF` — inputs, cards, menus, and dialog content.
- **Soft Paper Card** `#F5F4ED` — grouped and secondary surfaces.
- **Warm Oat Secondary** `#E8E3D0` — persistent selected groups and gentle emphasis.
- **Muted Parchment** `#EBE6D6` — tracks, placeholders, and non-interactive support surfaces.
- **Fine Warm Border** `#DED8CF` — one-pixel separation and structure.

### Accent & Interactive

- **Deep Terracotta** `#9E3D19` — semantic primary action, active navigation, focus, icon, and border emphasis.
- **Bright Terracotta** `#D1633C` — familiar Kairos CTA accent where the existing component uses the lighter expression.
- **Deep Teal** `#00666F` — secondary data and chart emphasis; it must not compete with primary actions.

Hover feedback on buttons is foreground-led. Do not reveal a new tinted background, plate, halo, glow, or shadow. Change text, icon strokes, borders, underlines, or internal graphics to the semantic primary/status color. A filled button may retain and slightly adjust its existing fill but must not gain another hover layer or shadow.

### Typography & Text Hierarchy

- **Strong Ink** `#1B1C18` — titles and critical values.
- **Warm Graphite** `#3D3B2E` — normal foreground and control labels.
- **Olive Gray** `#676556` — secondary descriptions and metadata.

### Functional States

- **Calm Green** `#477054` — success and completed results.
- **Amber Brown** `#A36316` — warnings and recoverable attention.
- **Earth Red** `#B3261E` — destructive and error states.
- **Muted Blue** `#3F6F9E` — neutral system information.

State meaning must never rely on color alone; pair it with text, iconography, shape, or position.

## 3. Typography Rules

### Hierarchy & Weights

Use Outfit throughout the product. Its geometric but friendly construction supports the calm, modern personality. Use Material Symbols Outlined for system icons. Reserve monospace for real code or machine identifiers.

Display typography is rare and uses 48 px/600 with tight tracking. Normal desktop page headlines use 24–32 px/600–700. Section titles use 18–20 px/500–650. Body copy sits at 14–16 px with a relaxed 1.5–1.6 line height. Labels use 12–14 px/500–650, and microcopy may use 10–11 px only in dense metadata contexts.

### Spacing Principles

Use a 4 px micro-grid and 8 px baseline rhythm. Keep related label/content gaps around 4–8 px, controls and card content around 12–16 px, compact sections around 24 px, and page margins around 28–32 px. Headings use slightly tight tracking; body text uses natural tracking and generous line height.

## 4. Component Stylings

### Buttons

Primary buttons use Deep Terracotta with white foreground, usually 9–12 px radii and a compact 36–44 px desktop height. Secondary buttons use a transparent or existing surface with a fine border. Ghost and icon buttons are transparent with no shadow.

Mandatory hover treatment: do not add a background, halo, glow, drop shadow, elevated shadow, or floating plate. Change the text, icon, line, underline, border, or internal graphic to the primary/status color. Filled buttons may retain their existing fill and make a subtle color adjustment without gaining elevation. Keep a clear `focus-visible` ring for keyboard users. Persistent selected, checked, pressed, and current-route states may use a fill because they communicate lasting state rather than hover.

### Cards & Domain-Specific Containers

Cards use Raised Porcelain or Soft Paper Card surfaces, one-pixel warm borders, 12–16 px radii, and 14–20 px internal padding. Default elevation is none or very light. Floating menus and dialogs may use stronger shadows to separate them from the canvas. Interactive cards should emphasize border, title, icon, or internal pattern rather than suddenly acquiring a large shadow.

Calendar glass surfaces may use controlled transparency over user wallpapers, but ordinary pages should remain paper-like. Habit cards can include small terracotta edge accents, content emoji, heatmaps, and carefully bounded motion. Schedule cards and tables favor clear information hierarchy over decorative elevation.

### Navigation

The desktop shell uses a 64 px top bar with a horizontal primary navigation and Electron drag-safe regions. Current-route state may use the existing GooeyNav persistent indicator or another stable primary mark. Ordinary hover changes the label, icon, or indicator line color and does not create a new button background.

Window controls follow the same foreground-led hover rule: keep the button surface unchanged and change the glyph to the relevant foreground or danger color. Preserve platform behavior, accessible labels, and drag/no-drag contracts.

### Inputs & Forms

Inputs use Raised Porcelain surfaces, the semantic input border, Strong Ink, and 12–16 px radii. General fields are 44–50 px high; compact toolbar search/filter fields may be 34–36 px. Focus uses the primary ring and border. Labels remain visible outside placeholders. Disabled fields retain readable content and do not react to hover.

### Kairos-Specific Components

- **App Shell:** single top navigation, window controls, global dialogs, reminders, toasts, route coordination, and shared player placement.
- **Calendar and Schedule:** paper/glass calendar grid, data cards, tables, schedule editor, and date-range picker.
- **Habits:** reorderable habit cards, completion controls, progress ring, streaks, and heatmaps.
- **Music:** one shared bottom player, elastic progress/volume, playlist, and queue.
- **AI Chat:** warm message surfaces, composer, attachments, tool results, and schedule cards.
- **Desktop Pet:** transparent window with themed speech/menu surfaces and a foreground-led restore icon button.

## 5. Layout Principles

### Grid & Structure

The AppShell owns the 64 px top bar and route content. Normal content height is based on the viewport minus the bar. Calendar and Music reserve the shared 80 px bottom player footprint. Desktop page margins are usually 28–32 px. Data cards use responsive CSS Grid; toolbars use Flex and wrap or stack when space contracts.

### Whitespace Strategy

Whitespace is deliberate rather than luxurious. Dense data remains readable through 12–16 px card padding, clear type hierarchy, fine separators, and 24–32 px section breaks. Avoid both cramped utility panels and oversized marketing-page whitespace.

### Alignment & Visual Balance

Prefer left-aligned headings, descriptions, forms, and tables. Right-align numeric columns when useful. Page headings, descriptions, and primary actions should share a clear baseline. Use progress rings, album artwork, heatmaps, or calendar structure as domain-specific focal points instead of generic hero decoration.

### Responsive Behavior & Touch

Kairos is desktop-first but supports narrow windows. Four-column card grids collapse to two and one columns; toolbars stack; search fields expand; two-month pickers reduce to one; top navigation may hide labels and secondary actions. Compact controls must remain at least 36 px, with 40–44 px targets preferred for primary or touch-relevant actions.

## 6. Design System Notes for Stitch Generation

### Language to Use

Use prompts such as: “warm editorial desktop utility,” “paper-like bone surfaces,” “terracotta semantic actions,” “Outfit typography,” “fine warm-gray borders,” “compact but breathable data density,” “soft rounded geometry,” and “restrained tactile motion.”

Avoid: “generic SaaS dashboard,” “neon AI,” “heavy glassmorphism,” “dramatic floating shadows,” and “hover cards behind icon buttons.”

### Color References

Anchor generated screens in Warm Paper `#FBF9F2`, Raised Porcelain `#FFFFFF`, Warm Graphite `#3D3B2E`, Olive Gray `#676556`, Deep Terracotta `#9E3D19`, Bright Terracotta `#D1633C`, and Fine Warm Border `#DED8CF`.

### Component Prompts

1. “Create a compact Kairos schedule workspace using warm paper surfaces, four responsive metric cards, a fine-bordered table, Outfit typography, terracotta status emphasis, and icon buttons whose hover only changes the icon or border color—never adding a background or shadow.”
2. “Create a Kairos habit card with a small content emoji, warm white surface, 14 px rounded corners, a fine border, a thin terracotta edge mark, completion and more controls, and reduced-motion-aware feedback. Button hover changes only the symbol or outline color.”
3. “Create a warm Kairos chat composer with a porcelain input surface, visible focus ring, compact attachment actions, and a terracotta send action. Preserve paper-like density and do not introduce a blue/purple AI theme or hover plates.”

### Incremental Iteration

Generate or edit only the target screen or component. Preserve the AppShell, route structure, shared player, typography, token palette, and nearby components. Compare the proposal to the current implementation and approved reference category before replacing any established layout. Convert reference hover backgrounds, glows, and shadows into Kairos foreground-led hover feedback.

