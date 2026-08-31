# Kairos repository instructions

These instructions apply to the entire repository. Product behavior, data integrity, accessibility, and the established Kairos visual language all take precedence over generic implementation preferences.

## UI work: mandatory reading order

Before planning or editing any user-facing UI, read these sources in order:

1. `docs/UI-DESIGN-SYSTEM.md`
2. `docs/UI-COMPONENT-INVENTORY.md`
3. `app/themes/claude-plus.css`
4. `references/README.md`
5. The current component, adjacent components, and styles that implement the affected screen

Do not start UI implementation until the existing patterns relevant to the task have been located. Search the repository for reusable components, semantic tokens, class names, layouts, and interaction behavior first.

## Design authority

When sources disagree, use this order of authority:

1. The current, working Kairos UI and its semantic theme tokens
2. Existing reusable components and interaction contracts
3. `docs/UI-DESIGN-SYSTEM.md`
4. Approved reference materials indexed in `references/README.md`
5. General UI conventions

An item in `references/` may inspire a layout, component, or motion treatment, but it does not override the current application by itself. When a reference conflicts with the shipped Kairos interface, preserve the current interface unless the user explicitly requests a migration.

## Preserve and extend; do not restart

- Make the smallest coherent UI change that satisfies the request.
- Extend the screen and component closest to the requested feature.
- Reuse existing components, controllers, stores, events, i18n messages, and CSS before creating alternatives.
- Do not replace a complete page, app shell, navigation system, dialog system, toast system, player, or theme layer unless the user explicitly requests it.
- Do not introduce a new component library, icon family, font, design system, visual theme, or styling framework without explicit approval.
- Do not paste a reference implementation wholesale. Translate the relevant idea into Vue/Electron and Kairos semantic tokens.
- Preserve the current Vue/legacy ownership boundary documented in `docs/UI-COMPONENT-INVENTORY.md`.

## Strict design-token policy

- Use semantic variables from `app/themes/claude-plus.css`, such as `--surface`, `--surface-raised`, `--surface-subtle`, `--foreground`, `--text-strong`, `--text-muted`, `--primary`, `--border`, `--input`, `--ring`, and status tokens.
- Do not add arbitrary colors, fonts, radii, shadows, spacing scales, or transition curves inside a component when an existing token or established value can express the design.
- If no suitable semantic token or component pattern exists, explain the design gap before adding one. Add the new token to the theme layer and document its role; do not hide a new visual decision in a local selector.
- Preserve Outfit as the application typeface and Material Symbols Outlined as the default UI icon family.
- Prefer the established 4 px/8 px rhythm, warm editorial surfaces, restrained borders, and rounded geometry.

## Mandatory button hover behavior

This rule applies to text buttons, icon buttons, toolbar actions, window controls, card-like buttons, menu actions, dialog actions, and buttons inside transient surfaces:

- Hover must not create a new filled background, tinted plate, halo, glow, drop shadow, or elevated shadow.
- Hover must not make the control appear to gain a floating rectangular or circular surface.
- Express hover through the foreground: change the text, icon, line, border, underline, or internal graphic to `--primary` or the appropriate semantic status color.
- A button that is already filled may retain its fill and shift its existing foreground or fill slightly, but it must not gain an additional hover background layer or shadow.
- Selected, checked, pressed, and current-route states may use persistent fills when the state needs to remain visible. Do not confuse persistent state styling with hover styling.
- Use `:focus-visible` outlines or rings for keyboard accessibility. Do not remove focus indication to satisfy the hover rule.
- Disabled controls must not react visually to hover.
- A destructive action may change its icon, text, or border to the danger token on hover; it must not reveal a danger-colored background only on hover.

When touching an existing component that violates this rule, bring that component's hover states into compliance if doing so is safe and within the task's scope. Do not perform an unrelated repository-wide CSS rewrite.

## Interaction, accessibility, and motion

- Every icon-only button needs an accessible name through visible text, `aria-label`, or an equivalent established pattern.
- Preserve visible `:focus-visible` treatment and logical keyboard order.
- Keep common targets at least 36 px in compact desktop surfaces and 40–44 px for primary or touch-relevant controls where space permits.
- Use motion to explain state or continuity, not as decoration. Favor existing 160–280 ms timings and the established easing curves.
- Respect `prefers-reduced-motion` and the application's reduced-motion class.
- Hover is an enhancement. Important meaning must remain available without hover.

## Required workflow for a UI task

Before editing, record in the working notes or response:

- the existing component(s) to reuse;
- the existing token(s) and styles to reuse;
- the approved reference category being consulted;
- the smallest planned change.

During implementation:

- keep behavior and visual changes separated where practical;
- retain current data and event contracts;
- update i18n for user-facing copy;
- keep Vue component styles and legacy styles consistent through semantic tokens.

After implementation:

1. Run the most relevant type check, test, or build.
2. Inspect the rendered result when a browser or app preview is available.
3. Compare hierarchy, spacing, typography, surfaces, and interaction states with the affected existing screen and approved references.
4. Explicitly check button hover and keyboard focus states.
5. Report any remaining mismatch or legacy styling debt instead of concealing it with broad overrides.

## Application coverage

These UI rules cover Calendar, Schedule, Habits, Music, AI Chat, Settings, Reminders, Toasts, dialogs and popovers, the desktop pet, the Electron app shell, title bar, player, and window controls.

