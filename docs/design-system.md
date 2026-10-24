# Nevorai Creator design system (Phase C, 2026-10-24)

Files: `src/tokens.css` (the ONE tokens file, light and dark), `public/brand/mark-a.svg` `mark-b.svg` `mark-c.svg` (logo marks), `docs/design/preview.html` (dashboard, onboarding, Orbit, phones, light and dark; open it in a browser). Wired into the app in D1: `@import "./tokens.css"` at the top of `src/index.css`, Tailwind `@theme` colours mapped to these variables, `data-theme` set in `index.html` before first paint.

Brief: creator, Instagram, funky, premium, aesthetic. Judged on its own; the violet is the one element shared with the Nevorai family, the symbol is Creator's own.

## Colour story
| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | #faf7fc warm off-white | #0b0812 deep plum | page |
| `--surface` / `--surface-2` | #ffffff / #f3eef9 | #130e1d / #1b1429 | cards, sidebar, inputs |
| `--glass` + `--glass-border` | white 72% | plum 62% | glass cards, top bars, phone tab bar (blur 14 to 16 px) |
| `--text` / `--text-2` / `--text-3` | #17112b / #574d6d / #8b819f | #f6f2fb / #b7adc9 / #7f7493 | text, secondary, muted |
| `--brand-magenta` `--brand-orange` `--brand-violet` `--brand-amber` | #ff2d8a #ff7a1a #7c3aed #ffb224 | same | accents only |
| `--grad-brand` | magenta to orange to amber | same | primary buttons, active marks, counts |
| `--grad-sunset` | violet to magenta to orange | same | avatars, hero glow, logo |
| `--success` `--warn` `--danger` `--info` | green, amber, red, violet | lighter | status pills |

Gradient goes only on the primary action, the active nav mark, counts and numbers that matter. Everything else is quiet so the gradient stays premium.

## Type and shape
| Thing | Rule |
|---|---|
| Display | Bricolage Grotesque 600 to 800, letter-spacing -0.02em (page titles, hero lines, big numbers) |
| Body | Inter 400 to 700, with Noto Sans Devanagari behind it (Hindi and Hinglish never fall to a system font) |
| Radii | 10 small, 14 buttons and fields, 20 cards, 28 frames; 999 only for pills |
| Buttons | ONE shape: rounded rectangle 14 px, 44 px tall (36 small). Primary = gradient + glow, secondary = surface + border, ghost, danger. Never a pill button |
| Pills | labels, counts, statuses, niche tags only |
| Fields | 44 px tall, 16 px text always (phones never zoom), focus ring violet |
| Cards | glass, 1 px glass border, soft shadow; hero card gets a blurred sunset glow |

## App shell (sidebar-standard, tabs-standard, mobile-app-feel)
| Part | Rule |
|---|---|
| Sidebar | 264 px (200 to 360 by dragging the edge 1:1), folds to 72 px icons, folded edge opens on drag or click, instant name tooltip, size in localStorage read before first render. Workspace switcher under the logo. Footer: Billing (owners only), Settings, Help |
| Nav | Today, Orbit (count), Ideas, Studio, Plan, Grow; Business: Talk (count), Sell, Mail; Setup: Brand Brain, Team |
| Page | max 1320 px, 3% gutter; header (title, subtitle, actions) then the tab bar; tabs on any screen with 3 or more sections; rows and tables on desktop |
| Phone | docked 5-tab bar: Today, Orbit, Studio, Plan, More (safe-area padding, glass); sidebar becomes a sheet; wizard steps keep their buttons in a bottom bar above the safe area |
| Motion | 200 ms ease-out for UI, 220 ms settle after a drag, honour reduced motion |

## Marks (public/brand)
| Mark | Idea | Verdict |
|---|---|---|
| A. Orbit C | a bold C (Creator) with a satellite dot (Orbit, the research core) | recommended; works as favicon and app icon |
| B. Echo | two arcs, the creator and the audience that repeats them | calmer alternative |
| C. Spark tile | gradient tile with a white sparkle (AI) | app-icon alternative |

Wordmark: "Nevorai" in 500 weight muted, "Creator" in 800. In the sidebar: mark + "Creator" with a small "NEVORAI" caption.

## Never
"client" on any screen; pill buttons; fields under 16 px; a narrow centred column on desktop; pictures through a paid optimiser; a horizontal page scroll; a `title` tooltip.
