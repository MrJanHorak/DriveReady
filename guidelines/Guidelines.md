# DriveReady design and code guidelines

These keep new screens consistent with the original Figma design ([Desktop Web Dashboard Design](https://www.figma.com/design/Whz9TgPqbRKDzbyiPCFKKg/Desktop-Web-Dashboard-Design)).

## Visual design

- Build screens from `src/app/design.tsx`: `Card`, `CardHeader`, `Badge`, `SkillTag`, `ProgressRing`, `ProgressBar`, `RouteSketch`, `primaryButton` and `ghostButton`. Add new shared pieces there rather than styling one-off copies.
- Colours come from `src/styles/theme.css`. Use primary teal `#0C7A8D`, accent `#12B5C9`, the light teal surface `#E4EFF2`, and the grey page background with white rounded cards (`rounded-2xl`, thin border).
- Type: Plus Jakarta Sans for headings (the `heading` style), Inter for body text, JetBrains Mono for small labels, dates, durations and chips (the `mono` style).
- Layout: grey page, white cards with a title and short subtitle, and one primary action per screen in teal. Use split views (list beside a large map or table) on desktop that stack on phones; check every screen at 390 px wide.
- Skill and condition chips keep one stable colour per catalogue label (see `tagColours` in `design.tsx`). Unpractised items use the dashed, muted chip.
- There is no component library. The Figma export's unused shadcn kit was removed on November 12, 2026; add shared pieces to `design.tsx` instead.

## Content

- Encourage, don't judge: show exposure ("practised ×3"), never readiness or safety scores.
- Say plainly when something is a personal record, not certification, and link official Georgia DDS sources for requirements.
- Routes are suggestions, not navigation; keep the OSRM/OpenStreetMap attribution visible.

## Code

- Shared-space changes go through the service (`server/sharedAccess.mjs`); clients never write shared data directly.
- Keep labels and roles that tests rely on (`getByLabel`, `getByRole`) when restyling; run `npm test`, `npm run typecheck`, `npm run test:shared` and `npm run test:browser` before committing.
- Use fictional data only, in code, tests, screenshots and demos.
