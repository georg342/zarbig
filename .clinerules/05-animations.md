# SKILL: Neo-Brutalist Animations & Transitions

## Core Philosophy
Animations in this project must feel mechanical, instantaneous, and highly responsive. Avoid all "smooth", "soft", or "floaty" web animations. Transitions should feel like interacting with a tactile hardware terminal or a raw structural interface.

## 1. Timing & Durations
- **Extremely Fast:** Durations must be between `75ms` and `150ms`. Never use durations longer than `200ms` for UI micro-interactions.
- **No Delays:** Feedback must be immediate. Do not use `transition-delay` unless strictly necessary for a staggered grid load.

## 2. Easing (Timing Functions)
- **Forbidden:** Do NOT use `ease`, `ease-in-out`, or any bouncy cubic-bezier curves.
- **Allowed:** Use `linear`, `ease-out` (only for fast exits), or step functions like `steps(3)` for a robotic, frame-by-frame feel.

## 3. Interactive States (Hover & Active)
- **Hover:** Use instant or near-instant high-contrast color inversions (e.g., background goes from `#000` to `#00ff66`, and text goes to `#000`). Do not use soft background fades.
- **Active (Click):** Use strict scaling (`transform: scale(0.97)`) or hard translations (`transform: translate(2px, 2px)`) to simulate a heavy mechanical button press.
- **Shadows:** If using box-shadows for 3D depth, they must be solid and hard (`box-shadow: 4px 4px 0px var(--primary)`). On active state, translate the element and reduce the shadow to `0px 0px` to simulate pressing down. NEVER use `blur` radius.

## 4. Modals, Toasts & Drawers
- **Slide & Snap:** Elements entering the screen should slide in rapidly (`transform: translateY(0)`) without any bounce at the end.
- **Fades:** If opacity transitions are used, they must be lightning-fast (`0.1s linear`) just to prevent screen tearing, not to create a cinematic fade.

## 5. Implementation Rules
- Always use the `will-change` property on elements that move frequently (e.g., `will-change: transform`).
- Prioritize `transform` and `opacity` for animations to avoid layout thrashing. Never animate `width`, `height`, `margin`, or `padding` on interactive states.