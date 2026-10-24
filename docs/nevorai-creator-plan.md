# Nevorai Creator: product plan (Phase B)

Date: 2026-10-24. For Adarsh. Decision-ready: tables and short lines. Prices are Nevorai prices (+ GST), all OFF sale until he says so. Research behind every choice: `docs/market-research.md`.

**One line:** a creator picks their niches, pastes a few transcripts, and from the next morning a private AI team researches their niche, writes in their voice, posts, replies to DMs, mails their list and sells their courses and calls through their own Razorpay, for one flat rupee price.

## 1. Full list of features, options and sections

| Section (menu) | What is in it | Status today |
|---|---|---|
| **Today** | 06:00 brief: trending in your niches, what is ready for you, what worked, what stopped, one question. Also sent on WhatsApp. | raw feed only; brief not built |
| **Orbit** (research) | Trends (formats used by 3+ watched accounts), Outliers (3x own median), News (scored per niche), Deep research dossier, Formats library (proven vs candidate), Watchlist, Sources | watchlist, sources, outliers, deep research, formats built; trends and news scoring not |
| **Ideas** | ranked topics per niche with why-now and confidence; approve, dismiss, send to Studio | built |
| **Studio** (writing) | research -> 8 hooks -> script in own voice -> packaging (caption, first comment, hashtags, cover text, Shorts title) -> shoot card + edit brief; rewrite by talking ("angrier", "shorter", "more Hindi") | research, hooks, script built; packaging, shoot card not |
| **Plan** | calendar + board (idea -> researched -> scripted -> shot -> editing -> scheduled -> published), slot times from own data, stuck 2+ days = blocker | board built; calendar, scheduler, auto-post not |
| **Grow** (performance) | per reel: follows, saves, profile visits, comments; by pillar, hook, length, time; pattern analyst; weekly playbook | placeholder; needs Instagram Graph API |
| **Talk** (plug-in: Connect) | WhatsApp inbox and broadcasts, Instagram comment-to-DM, AI sales team, lead follow-ups | in Nevorai Connect; pass + provisioning needed |
| **Sell** (plug-ins) | Website or landing page (Websites), courses like a school (Courses), paid calls (Bookings), video funnel (Flow), products via own Razorpay | in the sibling products; passes needed |
| **Mail** | list, templates, sequences (welcome, launch, reminder), unsubscribe, per-tenant caps | not built; Resend account exists |
| **Brand Brain** | voice, pillars, hook formula, banned claims, language register; trained by chat (paste transcripts) | form built; chat trainer written, untested |
| **Team** | 13 AI employees (prompt, model, schedule, on/off), Manager chat (proposes, you approve), human members (owner/editor/viewer) | employees + manager built; members written, untested |
| **Settings** | niches, Instagram connection, own AI key (optional), domain (slug.creator.nevorai.com or custom), language | partial |
| **Billing** (owner only) | opens billing.nevorai.com signed in, "Back to Nevorai Creator"; plan and caps shown in plain numbers | pass written, untested |

Options per tenant: niches (many), language (English, Hindi, Hinglish), tone register, posting days, brief time, WhatsApp number for the brief, own AI key or Nevorai credits, custom domain.

## 2. What a creator can expect

| When | What they get |
|---|---|
| First 10 minutes | account from the payment, niches picked, Brand Brain built from pasted transcripts, first 5 ideas on screen |
| Every morning | the brief: 3 to 5 topics in their niches with sources, one ready script, what posted yesterday did |
| Every day | hooks, script, caption, hashtags, shoot card in their voice in under 2 minutes per reel; DMs answered; leads followed up |
| Every week | playbook: what won, what died, which format to retire; email to their list |
| Every month | plan usage in plain numbers; invoice from billing.nevorai.com; cancel in one tap |

Promise words: "research team", "your voice", "your own Razorpay, 0% to us", "cancel in one tap". Never "unlimited", never "guaranteed growth".

## 3. How we help (the loop)

Orbit watches (news + 40 accounts per niche, nightly) -> Ideas rank -> Studio writes in the voice -> Plan schedules -> Talk and Mail sell -> Grow measures follows and saves -> Playbook feeds the writers. The last edge is the product; without it this is 13 chatbots.

## 4. Everything we automate

| Job | Done by | Trigger | Human tap? |
|---|---|---|---|
| Niche research (news, outliers, trends) | I-01, I-02, I-03 | nightly cron | no |
| Deep fact dossier with sources | I-04 | on demand | no |
| Topic ideas | C-01 | after the nightly run | approve or dismiss |
| Hooks, scripts, captions, hashtags, cover text | C-02, C-03, C-04 | on demand or on approve | pick and edit |
| Shoot card and edit brief | P-01 | when a script is approved | no |
| Posting calendar and slot times | P-02 | daily | confirm |
| Auto-post to Instagram | P-02 via Graph API | scheduled | optional review step |
| DM replies (Instagram comment -> DM, WhatsApp) | Connect AI replies | on message | hand-off on buy intent or anger |
| Lead follow-up (3 touches), sales conversation, payment link | Connect AI sales team | on lead | approve the offer text once |
| Email sequences and newsletters | Mail (Resend) | on sign-up, launch, schedule | approve template once |
| Reminders (shoot day, stuck items, trial end) | Manager | daily | no |
| Reports (daily brief, weekly playbook, monthly summary) | M-00, A-01, A-02 | cron | no |
| Team tuning (prompts, models) | Manager proposals | on feedback | approve or reject |

## 5. Niche model

| Piece | Design |
|---|---|
| Catalogue | `niches` table: health, fitness, astrology, spirituality, trading and finance, business, politics, news and current affairs, education and exams, tech and AI, comedy, beauty, fashion, food, travel, parenting, motivation, devotional, regional news; plus **custom** (creator types it) |
| Selection | `tenant_niches` (many per tenant, one marked primary); shown as chips at onboarding and in Settings; plan caps the count (Creator 2, Pro 5, Business 10) |
| Niche pack | per niche: default RSS sources, seed watch handles, pillar suggestions, banned-claim hints (health, finance), hook examples, language defaults. A custom niche gets a pack drafted by AI from 3 questions, approved by the creator |
| Orbit per niche | sources and watchlist rows carry `niche_id`; nightly runs loop per niche; ideas and briefs tagged by niche; outlier rule unchanged |
| Employees per niche | prompts take `{niches}` and the pack's rules; one employee row per tenant, context per niche at call time (no 13 x niches rows) |
| Caps | AI credits per tenant per month (exists); per-niche nightly research capped by plan |

## 6. Onboarding (under 5 minutes, feels like an app)

1. Payment on billing.nevorai.com -> Kaizen `provision` -> account + "set your password" email (exists).
2. **Welcome**: name, handle, language. One question per screen, progress dots, no form walls.
3. **Niches**: chips, pick many, add custom. First idea cards appear faintly behind as you pick (preview).
4. **Connect or paste**: paste 3 transcripts or captions (or connect Instagram later); Brand Trainer chat asks at most two questions a turn (exists) -> "Build my Brand Brain".
5. **Watch**: pack-suggested accounts and sources pre-ticked; untick or add.
6. **First ideas**: a run starts immediately on pack sources + pasted text; 5 ideas within minutes; "Write this one" opens Studio.
Done-feel checks: skeleton under 100 ms, 16 px inputs, no zoom, no sideways scroll, light and dark.

## 7. How the creator sells (money never touches Nevorai)

| Sells | Product | Money | Creator sees in Nevorai Creator |
|---|---|---|---|
| Courses like a school | Nevorai Courses | their own Razorpay keys inside Courses | Sell tab card: students, sales this month, "Open Courses" pass |
| Paid calls, consultations | Nevorai Bookings | own Razorpay | bookings today, "Open Bookings" |
| Website, landing page, link-in-bio | Nevorai Websites | n/a (pages) | page views, leads, "Edit site" |
| Digital products, downloads | Websites page + own Razorpay Payment Page | own Razorpay | link and leads |
| Video funnel before a sale | Nevorai Flow | own Razorpay | views, leads |
| Brand deals | Media kit page (Websites) + Mail | direct | later |

Nevorai's only money is the subscription via Kaizen. 0% on sales, stated on the pricing page.

## 8. AI sales team over WhatsApp (in Connect, shown in Creator)

Flow: Instagram comment or DM keyword -> DM reply with WhatsApp opt-in -> AI qualifies (who, goal, budget) in Hinglish -> offers the right product (course, call, product) with the creator's own payment link -> 3 follow-ups over 5 days -> hands to the creator on buy intent, anger or a question it cannot answer. Trained on: Brand Brain (voice), the offers catalogue (price, what, for whom, objections), and the nevorai-whatsapp-closer playbook (opener, value, objection, close). Rules: never invents prices or claims; per-tenant monthly AI reply cap; opt-out word honoured; every conversation visible in the Connect inbox; Kaizen sees counts.
Needs: Connect's Instagram DM channel (Meta app review, Connect's roadmap) and a "sales persona" import from Creator (Brand Brain + offers pushed to Connect through its API).

## 9. Hub integrations (one login, one dashboard, zero duplicated code)

| Product | Shown in Creator | Opens by | Data back to Creator | Created by |
|---|---|---|---|---|
| Websites | Sell > Website card | signed pass to lp.nevorai.com (`/from/creator#t=`) | views, leads via its feed or API | Kaizen provision (bundle) |
| Courses | Sell > Courses card | signed pass | students, sales counts | Kaizen provision |
| Bookings | Sell > Calls card | signed pass | bookings count | Kaizen provision |
| Connect | Talk tab | signed pass; brief sent with `POST /v1/send` | messages in/out, leads | Kaizen provision |
| Flow | Sell > Funnel card | signed pass | views, leads | Kaizen provision |
| Kaizen billing | Billing menu | signed pass (exists) | plan, limits via provision | n/a |
| SocialWire | source in Orbit; Studio entry on their side | pass both ways | reels, transcripts, debunks (consent) | n/a |

Pass standard (same as Kaizen's): `base64url(claims).base64url(HMAC)`, claims `{v, p, email, ref, name, iat, exp<=120s, jti}`, in the URL fragment, single use. Each product adds a `/from/creator` route and a `KAIZEN_SECRET`-style shared secret per pair. One login = Nevorai OS auth (same project) so the same email is the same person everywhere.

## 10. Tenant and data model (schema creator_os; every row tenant_id + RLS; never using(true))

| Group | Tables |
|---|---|
| Tenancy (0013, written) | tenants, tenant_profile, tenant_members, tenant_secrets, platform_settings, ai_usage, brand_chat, kaizen_events |
| Content (exist, tenant-scoped by 0013) | reels, watchlist_accounts, sources, brand_brain, employees, app_settings, news_stories, watchlist_posts, studio_sessions, formats, reel_formats, ideas, manager_messages, manager_proposals |
| New (D1, D2) | niches, tenant_niches, niche_packs; `niche_id` on sources, watchlist_accounts, ideas, news_stories; briefs; packaging columns on studio_sessions |
| New (D4, D5) | tenant_products (which plug-ins are on, their refs), mail_lists, mail_contacts, mail_templates, mail_sends, mail_unsubscribes |
| Roles | owner (billing, members, keys), editor (write content), viewer (read); platform admin (creator_os.owners) is not a content door |
| Tenant from host | `tenant_by_host()`: slug.creator.nevorai.com or custom domain (0013) |

## 11. Reused from Creator OS

Everything in section 1 marked built: watchlist scraper (Apify), RSS desk, deep research, hooks and script writers, ideas, board, formats, employees as rows, manager propose/approve, owner lockdown pattern, design primitives. Adarsh is tenant #1 (slug `adarsh`, billed manually, template tenant for seeding).

## 12. SocialWire hand-off

SocialWire stays the audience and front door. A SocialWire creator sees a "Studio" entry that opens Nevorai Creator signed in by pass (same email = same Kaizen customer). Their SocialWire reels, transcripts, debunks and issues become a connected Orbit source (read-only function in the `socialwire` schema, consent flag). Later: one Apify watcher for both (shared handle store). SocialWire's Rs 499 "Get followed by Orbit" plan stays its own; Creator cross-sells it, never merges it. Plan doc for the integration itself: write when D2 is done.

## 13. Kaizen contract steps (his clicks and SQL, mine to prepare)

1. Product registry row: `product_key = creator`, printed name "Nevorai Creator", `provision_url = https://wxgfaaaboftzsazknbvl.supabase.co/functions/v1/kaizen`, `secret_env = KAIZEN_SECRET_CREATOR`, `login_url = https://creator.nevorai.com`, `pass_enabled`.
2. Secret: one 32+ char value in Kaizen's Vercel env and in the Creator edge-function secrets (`KAIZEN_PROVISION_SECRET`). Vault name `creator_kaizen`.
3. Plans (SQL for his clipboard, `public_buy = false`): creator 999, pro 2499, business 4999, studio 9999, each `gst_mode = excl`, yearly twins `-yearly`, top-ups `topup-credits` 499, `topup-number` 999, `topup-seat` 299. Limits jsonb: niches, watchlist, sources, seats, ai_credits, emails, plugins.
4. Feed and pulse: `creator_os.kaizen_tenant_feed()` and `kaizen_pulse()` (0013) + `PULSE_TARGETS` line in Kaizen (`studio_sessions`, minPrev7d 7); Creator is SELF_SERVE in feeds.
5. Trial switch stays OFF; turn on when he says.
6. **New Kaizen feature needed, do not work around it in Creator:** bundle plans (one subscription provisions several products: creator + connect + lpos + courses + bookings with each product's plan_key and limits). Until it exists, Business and Studio stay off sale; Creator and Pro can sell.
7. Billing pass route check (the 2026-10-04 rule): passes only for logins whose email the person proved (emailed set-password link). Team members added by an owner never get a Billing menu.

## 14. Phased build order

| Phase | Scope (smallest complete version) | Done when | He does |
|---|---|---|---|
| **D1 Tenancy + onboarding** | review, test, commit the written slice (0013, guards, Kaizen endpoints, Brand Trainer, Team); add niches tables and multi-select; onboarding screens from section 6; roles replace owner-only; sign-in by set-password link | typecheck + deno tests pass; 0013_attack.sql OK as signed-out, other tenant, viewer; phone-check 375 on every page and popup; 1600 px shot; cost scan | run 0013 + niches SQL (clipboard); deploy functions; set `KAIZEN_PROVISION_SECRET` later |
| **D2 Orbit per niche** | niche packs; sources and watchlist per niche; news scoring (I-01); trend scout (I-03); packaging writer (C-04); shoot card (P-01); daily brief in app; AI caps enforced on every call | a new tenant in two niches gets ideas, hooks, script, caption, brief with zero politics seed; one DB trip per page; 30 s cache + Realtime | nothing new (Apify token exists) |
| **D3 Kaizen contract** | verify provision/suspend/resume/cancel live with a Rs 1 test plan; Billing menu pass; plan limits in code and DB; feed + pulse registered | Kaizen Rs 1 test creates a tenant and emails the password link; suspend pauses; resume restores; plan rows in Kaizen OFF sale | registry row, secret, plan SQL (clipboard), Rs 1 test |
| **D4 Hub plug-ins** | tenant_products; Sell and Talk tabs; `/from/creator` pass routes in Websites, Courses, Bookings, Connect, Flow (each in its own repo, other sessions); brief on WhatsApp via Connect send API; sales persona push to Connect | a creator opens each product signed in from one menu and comes back; brief lands on WhatsApp | approve each product's pass secret; Connect Instagram DM needs Meta app review |
| **D5 Mail** | lists, templates, sequences, unsubscribe link, per-tenant caps, Resend domain per tenant later | 2,000-mail cap stops and says so; unsubscribe works; no spam-trap patterns | Resend key in function secrets (vault) |
| **D6 Public page** | creator.nevorai.com landing (landing-instant), pricing -> billing.nevorai.com/buy/creator, privacy (Nevorai's AI reads the data), terms, refund, support, sign-in, SocialWire entry | instant-check numbers; <=25 requests; LCP under 2.5 s mobile; 1600 px and 390 px checked | DNS for *.creator.nevorai.com wildcard; Vercel domain |
| **D7 Launch** | full security-audit, speed and cost-guard reports, feed/pulse verified in Kaizen, sample tenant in two niches end to end, final NEEDS HIM list | all gates green; plans ready to flip on sale | say "on sale"; Meta app review for Graph API (Grow) and Instagram DMs |

Order note: Grow (performance loop) and auto-posting wait for the Meta app review; they slot in after D4 as D4b when access exists.
