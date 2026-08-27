# Liquid — Finance Tracker

A personal finance tracker: day-to-day spending and grocery baskets, subscriptions and
recharges, and an investment portfolio. Photograph a bill and it fills itself in. Runs as a
responsive web app and installs on a phone as a PWA. All data lives in your browser —
nothing is uploaded except the bill image you send to Gemini for reading.

## Screens

| Tab | What it does |
| --- | --- |
| **Hub** | Net worth (cash + portfolio), safe-to-spend today, monthly income and burn with real month-over-month deltas, next renewal, portfolio P/L, the daily brief, and Signals. |
| **Ledger** | Every transaction grouped by real dates. Month stepper, cumulative-spend chart, category breakdown, basket price watch, filters and search (including items inside bills). |
| **Vault** | Subscriptions *and* recharges/bills (mobile, broadband, DTH, electricity…). Live countdowns, cycle progress, monthly burn with yearly plans amortised, "mark paid" to roll the cycle. |
| **Income** | Rent and other recurring income you are owed: houses, shops, land, retainers. Each period generates a due you tick off, unpaid months roll forward as arrears, and money lent to (or borrowed from) people is settled on the same screen. |
| **Invest** | Holdings across stocks, mutual funds, ETFs, crypto, gold, FDs and bonds, plus IPO applications that stay out of the portfolio until allotment. Allocation bar, per-holding return, price updates, and "buy more" that averages your cost and logs the outflow. |

## Income you are owed

Add a source once — "Shop 2 — MG Road", ₹8,000, due on the 5th — and every month
materialises its own due. Miss one and the shortfall carries: June ₹8,000 unpaid shows July
at ₹16,000 and August at ₹24,000, labelled with what is rent and what is arrears.

Collecting is oldest-first. Record ₹10,000 against that ₹24,000 and June clears in full,
₹2,000 lands on July, and the card drops to ₹14,000 owed with ₹6,000 still in arrears. Part
payments, waiving a period, and ending a tenancy are all one tap. Each collection writes a
real income entry into the Ledger.

The same screen tracks **people**: money lent out or borrowed, with an expected-back date
and part settlements. Those movements are logged as `transfer` entries — they move your cash
balance but never count as spending or income, so lending ₹5,000 does not look like a
₹5,000 spend.

## Ask Liquid — the agent

The **Ask** button opens a chat that edits your own data. Say
`add 50 paise as my grocery bill`, `remove Airtel Fiber and add Jio Fiber at 999 a month`,
`Sanjay paid 8000 rent today`, or `I lent 5000 to Ravi, expected back in 30 days`.

Gemini answers with tool calls, never with free-form edits, and **nothing is applied until
you confirm it**. Each proposed change is a card you accept or skip individually (or "apply
all"); deletions are marked as destructive. It sees a compact snapshot of your ledger,
vault, holdings, sources and loans — including ids — so "airtel air cyber" still resolves to
the Airtel Fiber plan. Amounts are exact: 50 paise is 0.5, never 50.

## IPOs

Pick asset class **IPO** and describe the application in lots, lot size and cut-off price.
While it is outstanding the money is *blocked, not spent*: it is excluded from portfolio
value, invested totals and allocation, and shown as its own "Blocked in IPOs" figure. When
the basis of allotment is out, enter the lots actually allotted — only that much becomes
shares and only that much is debited to the Ledger; the rest simply unblocks. No allotment
means no debit at all.

## Capture — three ways in

1. **Scan a bill.** Camera or file → Gemini reads merchant, date, grand total, tax,
   discount, payment method and **every line item** → you review and save. The photo is
   kept so you can look the bill up later.
2. **Quick add.** Type `chai 40, auto 120 to office, kirana 850 yesterday` and get three
   entries. If Gemini is unreachable, an on-device parser handles it — logging never
   depends on the network.
3. **Share to Liquid.** Installed as an app, it registers as a share target: send a
   payment screenshot or PDF bill from any app straight into the scanner. Home-screen
   shortcuts jump to Scan or Quick add directly.

## Automation

- **Morning brief** — yesterday's spend, safe-to-spend today, what renews in three days.
- **Evening check-in** — "how did today go?", with one-tap repeats of your usual entries.
- **Weekly review** — the week's total and next week's due dates.
- **Signals** (Hub) — actionable cards you can act on or dismiss:
  - *Recurring radar*: spots a repeating merchant and offers to add it to the Vault.
  - *Price hikes*: "Cult Fit now ₹1,999, was ₹1,799 — 11% more, ₹2,400 a year."
  - *Basket price watch*: per-item inflation from itemised bills, e.g. "Milk 1L ₹58 → ₹62".
  - *Anomalies*: a charge well above your own median for that category.
  - *Month-end forecast*: where the month lands against your budget.
  - *Stale prices*: holdings you haven't repriced in a week.
- **Vault autopilot** — renewals due while the app was closed roll forward on next launch
  and auto-log the charge when the plan has that enabled.

### Where did I buy the milk?

Because bills are itemised, any item has a history. Tap **See history** on a basket signal
(or search an item name in the Ledger) and you get every purchase: store, date, quantity
and unit price — each row opening the original bill photo.

### Reminders, honestly

Notifications are only as reliable as the platform allows:

| Setup | Behaviour |
| --- | --- |
| Installed PWA on Android/Chromium | Background notifications via Periodic Background Sync |
| Browser tab open | Notifications fire on a timer while the tab lives |
| iOS, or notifications denied | No OS notification, but the brief always appears on the Hub |

The Hub brief is the layer that always works; notifications are a bonus on top.

## Gemini key — two ways

The app picks whichever is available, preferring the server.

**Server proxy (recommended).** `server.ts` holds the key and serves the built app, so
the key never reaches the browser. The proxy only accepts this app's two operations and an
allowlist of models, so an open port can't be used as a general relay.

```bash
cp .env.example .env.local     # add your GEMINI_API_KEY
npm run serve                  # builds, then serves on http://localhost:3001
```

**Personal key in Settings.** No server needed — paste a key into Settings → Bill
scanning. It stays in that browser, is excluded from backups, and calls Gemini directly.
Fine on your own device; don't use it for a deployment other people can reach.

Default model is `gemini-3.7-flash` (about 4s for a receipt). Requests carry per-operation
timeouts and retry transient overloads; quick-add falls back to the on-device parser
rather than leaving you waiting.

## Run locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev      # http://localhost:3000 — proxies /api to the server on 3001
npm start        # the server alone (expects an existing dist/)
npm run serve    # build + serve, the one-liner for daily use
npm run lint     # typecheck
```

## Use it on your phone

1. `npm run serve`, then open the machine's LAN address on your phone (or deploy `dist/`
   plus `server.ts` anywhere).
2. **Add to Home Screen.** The layout switches to a bottom tab bar with a capture speed
   dial; the manifest and service worker make it launch fullscreen and work offline.

Data is per-device. Move it with **Settings → Export backup** / **Import backup** — the
JSON includes your bill photos.

## How the numbers work

Nothing is a stored headline figure. Every total is derived from the raw ledger
(`src/lib/finance.ts`, `src/lib/insights.ts`):

- Cash balance = opening balance + sum of all transactions
- Monthly income/spend and deltas = this month vs last month
- Safe-to-spend = (budget − spent − bills still due) ÷ days left in the month
- Portfolio value, P/L and allocation = units × current price per holding, excluding IPOs
  still awaiting allotment
- Rent outstanding = the newest period per source only (earlier shortfalls are already
  carried into it, so summing every period would count the same money twice)
- `transfer` entries (loans, repayments) move the cash balance and are excluded from both
  spend and income

Dates are plain ISO `YYYY-MM-DD` strings (`src/lib/dates.ts`), so "Today", "in 4 days" and
"Earlier this week" are always correct.

## Where the bills live

Photos go to IndexedDB on the device (`src/lib/receipts.ts`), keyed from the transaction
and included in exports. That file exposes a `ReceiptSync` seam: register an implementation
and every save also uploads to a remote archive. Google Drive is the obvious candidate but
needs a Google Cloud client ID and consent screen of your own — the hook is ready when
you have one.

## Accounts and sync

Optional. With no Supabase keys in `.env`, the app behaves exactly as it always
did: one browser, no account, no network. Add the keys and a sign-in screen
appears, with **Use this device only** still there for anyone who wants the old
behaviour.

- **Who sees what** is enforced by Postgres, not by the frontend. Every table
  carries a `user_id` and one policy: `auth.uid() = user_id`. A bug in the app
  cannot show one account another's rent.
- **Nothing that can drift is stored.** A period's `received` and a loan's
  `repaid` are summed from the ledger entries tagged with their id, so two
  devices that were offline together merge by appending rows. The worst case is
  a duplicate entry you can see and delete, never a silently wrong total.
- **Offline writes queue** in `localStorage` and replay on reconnect. The header
  badge says which state you are in: Saved locally, Syncing, Synced, Offline
  with a count, or Sync failed.

Setup, once:

1. Create a Supabase project. Run `supabase/schema.sql` in its SQL editor.
2. Authentication > Providers > Google: enable it, paste a Google OAuth client
   ID and secret whose redirect URI is
   `https://<project>.supabase.co/auth/v1/callback`.
3. Authentication > URL Configuration: set Site URL and add a redirect URL for
   wherever the app runs.
4. Fill `.env` from `.env.example`.

## Deploying

The Express server in `server.ts` serves the built app *and* holds the Gemini
key, so one Render web service covers both. `render.yaml` is the blueprint:
Render > New > Blueprint > pick the repo, then paste the environment variables
it asks for.

Two things that bite:

- `VITE_*` values are baked in at build time, so they must exist as environment
  variables on the service, not only at runtime.
- Render sets `NODE_ENV=production`, which makes plain `npm ci` skip
  devDependencies — and both `vite` (build) and `tsx` (start) live there. The
  blueprint uses `npm ci --include=dev` for that reason.

After the first deploy, add the new https origin to Google (Authorized
JavaScript origins) and to Supabase (Site URL plus redirect URLs). Then open it
on a phone and Add to Home Screen: an https origin is also what the service
worker and PWA install need, which is why a `http://192.168.x.x` LAN address
cannot do the job.

Who can sign in is controlled by `ALLOWED_EMAILS` — a comma-separated list.
Leave it empty and anyone with a Google account can create one and spend your
Gemini quota. Funded AI actions per account per month come from
`AI_MONTHLY_CAP`; past it, people are asked for their own key in Settings.

## Project layout

```
src/
  lib/         dates, formatting, derived finance math, insights, Gemini client,
               prompts (shared with the server), receipt store, reminders, storage,
               income dues + arrears, loans, agent tool-call plumbing
  components/  one file per screen, plus capture/detail modals and shared UI
  data/        default settings and the on-demand sample dataset
  types.ts     the data model
server.ts      optional express server: key custody + static hosting
public/        PWA manifest, icons, service worker (share target + nudges)
```
