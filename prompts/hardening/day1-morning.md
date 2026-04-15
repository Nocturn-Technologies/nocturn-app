# Day 1 morning — UI polish + mobile responsiveness audit

**Mode: AUDIT ONLY. Do not edit any non-audit file.**

Audit the UI of every page under `/dashboard` for visual consistency AND mobile responsiveness. Write your findings to `.hardening/day1/audit.md` using the template in `_context.md`. Do not fix anything.

## Audit 1 — Dashboard visual consistency
Check every page under `src/app/(dashboard)/dashboard/`:
- Spacing / padding uses Tailwind scale (no arbitrary values unless justified)
- Dark-theme contrast on `bg-card`, `bg-nocturn` surfaces — text legible
- Font usage: Outfit for headings, DM Sans for body (project standard)
- Brand purple `#7B2FF7` on primary actions consistently
- Empty states exist wherever data can be zero — never blank screens
- Loading states (skeleton or spinner) on every async fetch
- Long strings (event names, collective names, DJ names) truncate with ellipsis, no layout break

## Audit 2 — Mobile responsiveness at 375px
For each page under `src/app/(dashboard)/dashboard/`:
- Bottom tab bar visible and functional below 768px, sidebar hidden
- All tap targets ≥ 44px
- No horizontal overflow
- Tables convert to card layouts on mobile
- Modals/sheets go full-width on mobile
- Text doesn't overflow containers
- Forms are usable (inputs not tiny)

## Output format
Combine both audits into one `.hardening/day1/audit.md` file. Each issue gets a section per the template, `file:line`, 3-10 line code excerpt, severity, and a one-sentence fix approach. Group issues by page if that helps readability.

## Stop conditions
- Do not edit any source file
- Do not run `npm run build` (this is read-only)
- Commit only `.hardening/day1/audit.md`
