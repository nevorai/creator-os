# Creator OS — context for any Claude Code session

**Read this file first. It is written so a cold session with zero history can continue the build.**

## What this is

Creator OS is Adarsh Chaturvedi's personal AI social media team — a web app that runs a
13-employee "AI newsroom" for his Instagram content. Design finished 2026-09-16. Every screen except Performance has been built
and live since 2026-09-22. STATUS.md's top block is the verified current state.

Target domain: **creator.nevorai.com**

## Who it is for

Adarsh (see `~/.claude/projects/-Users-apple-nevorai/memory/user_profile.md`). Indian founder,
non-technical in the sense that he does not read code or open local files — **give him plain
numbered next steps in chat, never a file path**. He speaks Hinglish, wants direct answers.

**His stated goal, verbatim in spirit:** build a *cult* audience — people who admire him, relate
to him, and follow him to YouTube and a podcast later. Then brand deals. Views are explicitly NOT
the scoreboard. Build for himself first; only sell to other creators if it works on his own page.

## His niche (confirmed 2026-09-16)

Politics, current affairs, trending news and incidents, and **reservation** — plus a business-politics
crossover (office politics, corporate/startup politics). Content type is **explainer + argument**,
not tips or tutorials.

**IMPORTANT:** the memory file `content_reel_system.md` lists 5 pillars (AI Tools / Trend-jack /
Taarak Mehta / Network Marketing / His Apps). Those belong to a *different* account and do NOT
apply here. The pillars for Creator OS are in `docs/05-pillars.md`.

## Architecture in one paragraph

Four desks run in sequence, every day: **Intelligence** finds what to talk about (news, 40-account
influencer watchlist, trend scout, deep research) → **Creative** writes it (topic planner, hook
writer, voice-matched scriptwriter, packaging) → **Production** ships it (coordinator, scheduler,
plus two humans — AI cannot edit video) → **Performance** judges it (performance analyst, pattern
analyst, playbook keeper) → and Performance **feeds back into Creative**. That last edge is the
whole design; without it the tool is 13 disconnected chatbots. One Manager agent runs the desks
and files a 06:00 daily brief, which is the only thing Adarsh reads most mornings.

Full detail: `docs/01-architecture.md`. Screens: `docs/06-screens.md`.

## Stack (decided)

- React + Vite + TypeScript + Tailwind
- Supabase — Postgres, Auth, Edge Functions, pg_cron. Lives in the shared **Nevorai Tools**
  project (`wxgfaaaboftzsazknbvl`), in its own **`creator_os` schema** — not a dedicated project,
  and not the `public` schema. `src/lib/supabase.ts` sets `db.schema: 'creator_os'`; any new table
  goes in that schema, and any raw SQL/REST call must pass `Accept-Profile`/`Content-Profile:
  creator_os` (supabase-js does this automatically once the client is configured this way).
- Vercel hosting
- **Both** AI providers: Gemini Flash for transcription + high-volume classification, Claude for
  Scriptwriter / Hook Writer / Pattern Analyst / Deep Research. Per-employee model override lives
  in the admin panel.
- Apify for Instagram scraping of other accounts
- Instagram Graph API for his own metrics (Creator account, Facebook Page connected — confirmed)

## The two architectural ideas that matter

1. **An employee is a database row, not a code file.** Name, prompt, model, provider, cron
   schedule, enabled flag — all editable from the admin panel. Hiring a 14th employee must not
   require a deploy.
2. **The Library table is the foundation.** Every reel he has posted: transcript + metrics +
   which format it used. The Scriptwriter reads it to sound like him, the Pattern Analyst reads it
   to find what works, the Playbook Keeper reads it to know what changed. Build this table properly
   before anything else.

## Reuse — do not rewrite

`~/above1million` already contains a working Apify Instagram scraper edge function, a reels table,
a daily pg_cron job, and a Claude classification step, all build-clean. **Lift it** as the
Influencer Watch desk rather than writing it twice.

## Hard limits already told to Adarsh — do not walk these back

- Competitor **shares and saves are unobtainable by any tool** (Instagram gives them to the post
  owner only). Use (likes + comments) ÷ views as a labelled proxy.
- **AI cannot edit video.** Production stays human; AI writes the edit brief.
- No trending-audio API exists. Substitute: flag audio used by 3+ watched accounts in 7 days.
- Scraping other accounts is against Instagram ToS — common practice, small real risk, he has been
  told.

## Working agreements

- End every reply to him with a plain-language numbered **"WHAT YOU DO NEXT"** section.
- Never hand him a file path or tell him to open a file. Paste content in chat, or give a
  `pbcopy` command in a bash block.
- He is cost-conscious about session credits — batch verification, do not iterate query by query.
- Edit this repo directly in Claude Code (the Lovable-prompt rule does NOT apply to this project).
- Do not push to GitHub without asking — this repo contains his political content and strategy.

## Security -- read before touching auth or RLS

Creator OS lives in the shared **Nevorai OS** project (`wxgfaaaboftzsazknbvl`, renamed from Nevorai
Tools), where other apps' people log in too (AdsPro and Meta review accounts, Academy OS students and
coaches). So "signed in" means nothing here. Since migration **0012** (2026-09-29):
- Only accounts in `creator_os.owners` (Adarsh, teamnevorai `32dc9eb8-4c68-47c0-8440-cdbcea9ca35c`)
  can touch any row. Every table has ONE policy, `<table>_owner_all`, using `(select creator_os.is_owner())`.
- Any new table needs the same policy (copy the loop in 0012). Never add a `using (true)` policy.
- Edge functions: browser ones call `ownerOnly(req)` right after `getUser()`; scheduled ones start with
  `scheduleOrOwner(req)` (service_role key or an owner). Both live in `supabase/functions/_shared/owner.ts`.
- Check any change with `supabase/checks/0012_check.sql` (every row must say OK).

## Where to start

Read `STATUS.md`. It says exactly what is done, what is blocked, and what the next action is.
