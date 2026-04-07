# Design System — Nocturn

## 1. Visual Theme & Atmosphere

Nocturn is a dark-first, mobile-first SaaS for nightlife promoters and music collectives. The design evokes the feeling of a premium nightclub app — dark, atmospheric, and electric — without being gaudy or club-flyer kitsch. Think Linear meets Spotify, designed for someone checking their phone backstage before a set.

The entire app sits on a near-black canvas (`#09090B`) with a subtle grain texture overlay at 3% opacity, giving screens the tactile feel of matte printed material rather than a flat digital surface. Cards use semi-transparent dark surfaces (`rgba(28, 28, 34, 0.6)`) with glassmorphism blur, creating layered depth. A radial purple gradient mesh floats behind content — barely visible but giving the page an ambient "club lighting" warmth.

The signature color is Nocturn Purple (`#7B2FF7`) — a vivid, saturated violet used for CTAs, active states, progress indicators, and brand moments. It glows. Buttons pulse with it. Progress bars fill with it. It is the single source of energy in an otherwise restrained dark palette. Secondary accents (teal `#2DD4BF`, coral `#FB7185`, amber `#FBBF24`) appear sparingly for status indicators and data visualization — never for primary actions.

**Key Characteristics:**
- Near-black canvas (`#09090B`) — never pure `#000`, always with subtle warmth
- Grain texture overlay at 3% opacity on `body::before` — noise SVG, 256px repeat
- Glassmorphism cards (`rgba(28, 28, 34, 0.6)` + `backdrop-filter: blur(12px)`)
- Purple gradient mesh — ambient radial glow behind content sections
- Single brand accent (`#7B2FF7`) that glows, pulses, and animates
- `border-white/5` to `border-white/10` — ghost borders, never solid lines
- `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for inputs, `rounded-full` for pills/badges
- Dark mode only — light theme does not exist

## 2. Color Palette & Roles

### Brand
- **Nocturn Purple** (`#7B2FF7`): The core brand color. Used for primary buttons, active tab indicators, progress bars, focus rings, icon accents, and any element that says "this is interactive." CSS: `bg-nocturn`.
- **Purple Light** (`#A855F7`): Hover state for purple buttons, secondary purple text. CSS: `bg-nocturn-light`, `hover:bg-nocturn-light`.
- **Purple Glow** (`#C084FC`): Tertiary purple for subtle highlights, pill backgrounds at low opacity. CSS: `bg-nocturn-glow`.
- **Purple 5%** (`rgba(123, 47, 247, 0.05)`): Tinted background for selected states, active list items. CSS: `bg-nocturn/5`.
- **Purple 10%** (`rgba(123, 47, 247, 0.1)`): Icon containers, badge backgrounds. CSS: `bg-nocturn/10`.
- **Purple 20%** (`rgba(123, 47, 247, 0.2)`): Stronger tinted backgrounds, glow containers. CSS: `bg-nocturn/20`.

### Semantic Accents
- **Teal** (`#2DD4BF`): Success indicators, positive trends, online status. CSS: `text-nocturn-teal`.
- **Coral** (`#FB7185`): Warnings, attention-needed badges, low-priority alerts. CSS: `text-nocturn-coral`.
- **Amber** (`#FBBF24`): High priority markers, "needs attention" indicators. CSS: `text-nocturn-amber`.
- **Green** (`#22C55E`): Success states, "done" checkmarks, positive profit. CSS: `text-green-500`.
- **Red** (`#EF4444`): Errors, destructive actions, overdue items, losses. CSS: `text-red-500`.
- **Blue** (`#3B82F6`): In-progress status, informational badges. CSS: `text-blue-500`.

### Surfaces & Backgrounds
- **Background** (`#09090B`): Page-level background. CSS: `bg-background`.
- **Card** (`rgba(28, 28, 34, 0.6)`): Card surfaces — semi-transparent with blur. CSS: `bg-card`.
- **Popover** (`#1C1C22`): Dropdown menus, popovers. CSS: `bg-popover`.
- **Zinc 900** (`#18181B`): Input backgrounds, secondary surfaces. CSS: `bg-zinc-900`.
- **Zinc 800** (`#27272A`): Tertiary surfaces, editable fields, slider tracks. CSS: `bg-zinc-800`.
- **Zinc 800/50** (`rgba(39, 39, 42, 0.5)`): Metric cards, stat containers. CSS: `bg-zinc-800/50`.

### Text
- **Foreground** (`#FAFAFA`): Primary text — headings, titles, important values. CSS: `text-foreground`.
- **White** (`#FFFFFF`): Button text on purple backgrounds. CSS: `text-white`.
- **Zinc 300** (`#D4D4D8`): Secondary body text, descriptions. CSS: `text-zinc-300`.
- **Zinc 400** (`#A1A1AA`): Tertiary text, labels, metadata. CSS: `text-zinc-400`.
- **Zinc 500** (`#71717A`): Quaternary text, placeholders, captions. CSS: `text-zinc-500`.
- **Zinc 600** (`#52525B`): Least-important text, disabled state, fine print. CSS: `text-zinc-600`.
- **Muted Foreground** (`oklch(0.708 0 0)`): shadcn's muted text token. CSS: `text-muted-foreground`.

### Borders
- **Ghost Border** (`oklch(1 0 0 / 10%)`): Default border — barely visible white at 10%. CSS: `border-border`.
- **Subtle Border** (`rgba(255, 255, 255, 0.05)`): Card borders, section dividers. CSS: `border-white/5`.
- **Visible Border** (`rgba(255, 255, 255, 0.06-0.10)`): Glassmorphism card edges. CSS: `border-white/[0.06]`.
- **Input Border** (`oklch(1 0 0 / 15%)`): Form input borders. CSS: `border-input` or `border-white/10`.
- **Focus Border** (`rgba(123, 47, 247, 0.5)`): Input focus ring. CSS: `focus:border-[#7B2FF7]/50`.
- **Purple Border** (`rgba(123, 47, 247, 0.2)`): Active/selected card borders. CSS: `border-nocturn/20` or `border-[#7B2FF7]/20`.

## 3. Typography Rules

### Font Family
- **Headings**: `Outfit` (variable weight, loaded via next/font). CSS: `font-heading`.
- **Body / UI**: `DM Sans` (variable weight, loaded via next/font). CSS: `font-sans` or default.
- **Monospace**: `DM Sans` (no dedicated mono font). CSS: `font-mono`.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Usage |
|------|------|------|--------|-------------|-------|
| Page Title | Outfit | 24px (text-2xl) | 700 (bold) | 1.33 | Page headers like "Event Playbook" |
| Section Title | Outfit | 20px (text-xl) | 700 (bold) | 1.4 | Card titles, section headers |
| Card Title | Outfit | 18px (text-lg) | 700 (bold) | 1.5 | Modal titles, feature names |
| Body Large | DM Sans | 16px (text-base) | 400-500 | 1.5 | Primary body text |
| Body | DM Sans | 14px (text-sm) | 400-500 | 1.43 | Standard UI text, task titles, descriptions |
| Caption | DM Sans | 12px (text-xs) | 400-500 | 1.33 | Labels, metadata, timestamps |
| Micro | DM Sans | 11px (text-[11px]) | 400-500 | 1.27 | Secondary captions, filter labels |
| Tiny | DM Sans | 10px (text-[10px]) | 400-500 | 1.2 | Badges, overlines, tertiary metadata |
| Nano | DM Sans | 9px (text-[9px]) | 400 | 1.2 | Fine print, chart labels |

### Principles
- **Outfit for hierarchy, DM Sans for everything else**: Outfit headings are always bold (700) and create the visual structure. DM Sans handles all interactive and body text.
- **No font size above 24px in the app**: This is a mobile-first tool, not a marketing page. The largest text is `text-2xl` for page titles. **Exception — Dashboard Greeting**: The home screen greeting may use `text-3xl md:text-4xl` for editorial hierarchy. This is the only permitted exception.
- **Uppercase tracking on labels**: Small labels use `uppercase tracking-wider` for emphasis at tiny sizes. CSS: `text-xs font-semibold text-zinc-400 uppercase tracking-wider`.
- **Truncation over wrapping**: Long text gets `truncate` rather than wrapping, preserving layout density. Critical on mobile.

## 4. Component Stylings

### Buttons

**Primary (Purple)**
- Background: `#7B2FF7` → hover `#6B1FE7`
- Text: White, font-semibold
- Padding: px-4 py-2 (min-height 44px for touch targets)
- Radius: `rounded-xl` (12px)
- Active: `active:scale-[0.98]` press feedback
- Shadow on hero buttons: `shadow-lg shadow-[#7B2FF7]/20`
- CSS: `bg-[#7B2FF7] hover:bg-[#6B1FE7] text-white rounded-xl min-h-[44px] active:scale-[0.98]`

**Secondary (Ghost/Outline)**
- Background: transparent
- Border: `border-white/[0.06]` → hover `border-white/[0.12]`
- Text: `text-zinc-400` or `text-foreground`
- CSS: shadcn `variant="outline"` or `variant="ghost"`

**Nocturn (Brand Buttons)**
- Background: `bg-nocturn hover:bg-nocturn-light`
- Text: White
- Used for: Submit, Send, Add, Create actions
- CSS: `bg-nocturn hover:bg-nocturn-light text-white`

**Nocturn Gradient (Premium Variant)**
- Background: `bg-gradient-to-r from-nocturn to-nocturn-light`
- Text: White, border `border-nocturn/20`
- Used for: Hero CTAs, checkout buttons, primary onboarding actions
- Shadow on hover: `hover:shadow-lg hover:shadow-nocturn/25 hover:brightness-110`
- CSS: shadcn `variant="nocturn"` uses this gradient automatically

**Icon Button**
- Size: 44x44px minimum (touch target)
- CSS: `size="icon" className="min-h-[44px] min-w-[44px]"`

### Cards

**Standard Card**
- Background: `bg-card` (semi-transparent dark + blur)
- Border: `border-white/[0.06]`
- Radius: `rounded-2xl` (16px)
- Padding: `p-4` to `p-5`
- Hover: `hover:border-nocturn/20` for interactive cards

**Glass Card**
- Background: `rgba(28, 28, 34, 0.5)`, `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(255, 255, 255, 0.06)`
- CSS class: `.glass-card`

**Stat/Metric Card**
- Background: `bg-zinc-800/50`
- Radius: `rounded-xl`
- Padding: `p-2`
- Content: Large bold number + tiny caption below

### Inputs

- Background: `bg-zinc-900`
- Border: `border-white/10`
- Radius: `rounded-xl` (12px)
- Min height: 44px
- Focus: `focus:border-[#7B2FF7]/50`
- Placeholder: `text-zinc-500`
- CSS: `bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50`

### Badges / Pills

- Radius: `rounded-full`
- Padding: `px-2 py-0.5` or `px-2.5 py-1`
- Font: `text-[10px] font-medium` or `text-[11px] font-medium`
- Variants:
  - Purple: `bg-nocturn/20 text-nocturn`
  - Success: `bg-green-500/10 text-green-400`
  - Warning: `bg-amber-500/10 text-amber-400`
  - Error: `bg-red-500/10 text-red-400`
  - Neutral: `bg-zinc-500/10 text-zinc-400`
  - Category-colored: `bg-{color}-500/10 text-{color}-400 border-{color}-500/20`

### Progress Bars

- Track: `h-2 rounded-full bg-muted overflow-hidden`
- Fill: `h-full rounded-full bg-nocturn transition-all duration-500`
- 100% complete variant: fill turns `bg-green-500`

### Tabs

- Container: `flex gap-1 rounded-lg bg-muted p-1`
- Active tab: `bg-background shadow-sm` + normal text color
- Inactive tab: `text-muted-foreground`
- Min height: 44px

### Toggle / Switch

- Off: `bg-zinc-700`
- On: `bg-[#7B2FF7]`
- Knob: white circle, `translate-x` animation
- CSS: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors`

## 5. Layout Principles

### Spacing Scale
- Use Tailwind's default scale: `gap-1` (4px), `gap-1.5` (6px), `gap-2` (8px), `gap-3` (12px), `gap-4` (16px), `gap-5` (20px), `gap-6` (24px)
- Vertical section spacing: `space-y-5` or `space-y-6`
- Card internal padding: `p-4` (16px) on mobile, `p-5` (20px) on larger cards
- Inline element gaps: `gap-1.5` to `gap-2`

### Max Width
- Content area: `max-w-lg` (512px) for forms and wizards
- Dashboard: full width with sidebar

### Mobile-First
- All layouts start mobile (`< 768px`) and enhance for desktop with `md:` prefix
- Bottom tab bar on mobile (4 tabs: Home, Events, Chat, Venues)
- Left sidebar on desktop (full navigation)
- All interactive elements: `min-h-[44px]` and `min-w-[44px]` for touch targets

### Responsive Breakpoints
- Mobile: `< 768px` (default)
- Desktop: `md:` (≥ 768px)
- No tablet-specific breakpoint — mobile layout scales

## 6. Depth & Elevation

### Shadow System
Nocturn uses almost no traditional box shadows. Depth comes from:
1. **Surface transparency** — layered semi-transparent surfaces create depth through backdrop blur
2. **Border opacity** — `border-white/5` → `border-white/10` → `border-white/20` for increasing elevation
3. **Purple glow** — `.glow-purple`: `box-shadow: 0 0 20px rgba(123, 47, 247, 0.15), 0 0 60px rgba(123, 47, 247, 0.05)`
4. **Active shadow** on hero CTAs: `shadow-lg shadow-[#7B2FF7]/20`

### Surface Hierarchy (back to front)
1. `#09090B` — Page background
2. `rgba(28, 28, 34, 0.6)` + blur — Cards (bg-card)
3. `#18181B` (zinc-900) — Inputs, nested surfaces within cards
4. `#27272A` (zinc-800) — Tertiary surfaces, editable field backgrounds
5. `rgba(39, 39, 42, 0.5)` (zinc-800/50) — Stat cards, metric boxes

### Interactive Card Hover Glow
- Cards may use `hover:shadow-lg hover:shadow-nocturn/10` for brand-colored hover feedback
- This is a glow effect, not a traditional shadow, and is permitted
- Keep opacity at ≤20% to maintain the subtle, atmospheric feel
- Combine with `hover:ring-1 hover:ring-nocturn/20` for a coordinated hover state

### Grain Texture
- `body::before` pseudo-element with `position: fixed; inset: 0; z-index: 9999; pointer-events: none; opacity: 0.03`
- SVG fractalNoise filter, `background-size: 256px 256px`, repeat
- Gives every surface a subtle matte paper texture

## 7. Do's and Don'ts

### Do
- Use `bg-nocturn` for primary actions — it's the brand signature
- Use `rounded-2xl` for cards, `rounded-xl` for inputs, `rounded-full` for badges
- Use `active:scale-[0.98]` on all tappable elements for press feedback
- Use `transition-all duration-200` for smooth state changes
- Use `animate-fade-in-up` for content entering the viewport
- Use `animate-scale-in` for modals and popovers
- Use `border-white/5` or `border-white/[0.06]` for ghost borders
- Use `min-h-[44px]` on all buttons and interactive elements (accessibility)
- Use `truncate` on text that might overflow (event titles, usernames)
- Use emoji as category/status indicators (📣 Marketing, 🔴 Overdue, ⚡ High priority)
- Use `text-[10px]` for badges and metadata — it's the Nocturn micro scale

### Don't
- Never use light theme — the app is dark mode only
- Never use pure `#000000` — use `#09090B` for backgrounds
- Never use solid visible borders — keep them at 5-10% white opacity
- Never use traditional drop shadows — use glow effects or transparency layering
- Never use font sizes above `text-2xl` (24px) in the app UI
- Never use colors outside the defined palette for interactive elements
- Never create a button without `min-h-[44px]` — it fails touch targets
- Never use inline styles for colors — use Tailwind classes (`bg-nocturn`, `text-zinc-400`)
- Never use `as any` TypeScript casts — the codebase has zero `as any`
- Never add emojis to code unless the user explicitly requests them

## 8. Responsive Behavior

### Mobile (default, < 768px)
- Bottom tab bar: 4 tabs with pill-style active indicator
- Full-bleed cards (no horizontal padding beyond page padding)
- Stack all layouts vertically
- Hide scrollbar: `main::-webkit-scrollbar { display: none }`
- Safe area insets: `padding-bottom: max(env(safe-area-inset-bottom), 8px)`
- Touch: `min-h-[44px]` on all interactive elements
- Press feedback: `active:scale-[0.95]` on buttons, `active:scale-[0.98]` on cards

### Desktop (md: ≥ 768px)
- Left sidebar with full navigation
- Content centered with `max-w-lg` for focused flows
- Wider cards with horizontal grids (`grid-cols-2`, `grid-cols-3`)
- Hover states: `hover:border-nocturn/20`, `hover:bg-white/5`

### PWA Considerations
- `overscroll-behavior: none` on html and body — no pull-to-refresh bounce
- `-webkit-overflow-scrolling: touch` on scroll containers
- `-webkit-tap-highlight-color: transparent` — no tap flash

## 9. Agent Prompt Guide

### Quick Reference
When building new pages or components in Nocturn, use these patterns:

**Page structure:**
```
<div className="space-y-6">
  {/* Header with back button */}
  <div className="flex items-center gap-3">
    <Link href="/dashboard/...">
      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </Link>
    <h1 className="text-2xl font-bold font-heading">Page Title</h1>
  </div>
  {/* Content */}
</div>
```

**Card pattern:**
```
<div className="rounded-2xl border border-white/[0.06] bg-card p-5 space-y-4">
  {/* Card content */}
</div>
```

**Form field pattern:**
```
<label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
  <Icon className="h-3.5 w-3.5 text-[#7B2FF7]" />
  Label
</label>
<Input className="bg-zinc-900 border-white/10 rounded-xl min-h-[44px] focus:border-[#7B2FF7]/50" />
```

**Stat card pattern:**
```
<div className="rounded-xl bg-zinc-800/50 p-2 text-center">
  <p className="text-xs font-bold text-white">$25</p>
  <p className="text-[9px] text-zinc-500">avg ticket</p>
</div>
```

**Badge pattern:**
```
<span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-400 px-2 py-0.5 text-[10px] font-medium">
  📣 Marketing
</span>
```

**Empty state pattern:**
```
<div className="flex flex-col items-center gap-4 py-12">
  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
    <Icon className="h-8 w-8 text-nocturn" />
  </div>
  <div className="text-center">
    <p className="font-medium">No items yet</p>
    <p className="text-sm text-muted-foreground">Description of what to do.</p>
  </div>
</div>
```

### Color Quick-Ref
| Purpose | Class |
|---------|-------|
| Primary action | `bg-[#7B2FF7]` or `bg-nocturn` |
| Primary hover | `hover:bg-[#6B1FE7]` or `hover:bg-nocturn-light` |
| Page background | `bg-background` (#09090B) |
| Card background | `bg-card` (semi-transparent) |
| Input background | `bg-zinc-900` |
| Primary text | `text-foreground` (#FAFAFA) |
| Secondary text | `text-zinc-400` |
| Muted text | `text-zinc-500` |
| Ghost border | `border-white/5` or `border-white/[0.06]` |
| Focus ring | `focus:border-[#7B2FF7]/50` |
| Success | `text-green-400` / `bg-green-500/10` |
| Error | `text-red-400` / `bg-red-500/10` |
| Warning | `text-amber-400` / `bg-amber-500/10` |

### Voice & Content
- Say "operators" not "users"
- Say "collectives" not "teams"
- Headings are confident and short: "Event Playbook", "Budget Planning", "Today's Focus"
- Descriptions are warm and direct: "What's the event?", "Everything look good?"
- Error messages are human: "Network error — please try again."
- Use sentence case for headings, never Title Case except for proper nouns
