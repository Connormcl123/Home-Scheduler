# Deal Finder Handoff

This is the handoff from the cloud session that built Deal Scout, a business-for-sale finder for Connor. The goal is to run it **locally on Connor's Windows PC**, with a **daily Gmail digest**.

Everything lives in [`deal-scout/`](deal-scout/). It is a self-contained Claude Code project, so you can copy that folder out into its own repo if you prefer.

| File | Purpose |
|---|---|
| `deal-scout/criteria.md` | Buyer criteria. This is the single source of truth. |
| `deal-scout/.claude/commands/deal-scout.md` | The full scouting procedure, run with `/deal-scout` |
| `deal-scout/.claude/settings.json` | Tool allowlist so headless `claude -p` runs never block on a prompt |
| `deal-scout/scripts/run-scout.ps1` | Runs one pass headlessly and logs it to `logs/` |
| `deal-scout/scripts/install-schedule.ps1` | Registers a daily Windows Task Scheduler job (default 6:49 AM) |
| `deal-scout/reports/2026-11-08.md` | The first digest, from a test run |
| `deal-scout/data/seen-listings.csv` | Listings already reported, used to skip repeats and track price changes |
| `deal-scout/README.md` | Step-by-step setup |

## 1. Buyer criteria

- **Location:** within about 50 miles of **Port St. Lucie, FL**.
  - **Towns:** Port St. Lucie, Fort Pierce, Stuart, Jensen Beach, Palm City, Hobe Sound, Vero Beach, Sebastian, Okeechobee, Indiantown, Jupiter, Tequesta, Juno Beach, Palm Beach Gardens, North Palm Beach, Riviera Beach, and the northern edge of West Palm Beach.
  - **Counties:** St. Lucie, Martin, Indian River, Okeechobee, and northern Palm Beach.
  - Online businesses count only if the seller is local.
- **Asking price:** $250,000 – $1,000,000. Up to $1.2M is allowed if cash flow is strong, and the digest flags it.
- **Cash flow / SDE:** no hard minimum. The test is SBA coverage, below.
- **Industries:** any. Connor chose "open-minded". There are no exclusions yet.
- **Deal structure:** most likely an **SBA 7(a)** loan with about 10% down over 10 years. Seller financing is a plus.
- **Exclusions:** anything outside the area or price range.
  - **Flag** listings with no financials and listings that are "no SBA".
  - Practices that need a licensed buyer (physician, attorney, audiologist) are kept but flagged.

## 2. Sources and searches

**How listings were found.** The cloud environment blocked direct HTTP to the listing sites. So far, every result has come from **web search queries**, not from filtered marketplace URLs. Running locally removes that block, so the local version should also open listing pages directly. The command file tells it to use WebFetch to verify top picks.

**Queries used in the test run (14):**
- `businesses for sale Port St. Lucie FL bizbuysell`
- `businesses for sale Stuart FL cash flow asking price`
- `businesses for sale Vero Beach FL`
- `businesses for sale Fort Pierce FL`
- `businesses for sale Jupiter FL SDE`
- `Treasure Coast business for sale owner retiring`
- `St. Lucie County business for sale bizquest`
- `Martin County Florida established business for sale seller financing`
- `Palm Beach Gardens OR North Palm Beach OR Riviera Beach business for sale cash flow`
- 5 detail lookups on specific listings: the hurricane shutter company, the Mobil station, the audiology practice, the electric company, and the HVAC company

**Sources the procedure must cover on every run:**
- **Marketplaces:** bizbuysell.com, bizquest.com, us.businessesforsale.com, dealstream.com, loopnet.com (businesses), businessbroker.net
- **Broker networks:** sunbeltnetwork.com, tworld.com (Transworld), plus local Treasure Coast and Palm Beach brokers
- **Other listings seen:** businessbrokerage.colliers.com

**Location-filtered index pages seen in results.** These are good starting URLs for direct fetching locally:
- https://www.bizbuysell.com/florida/stuart-businesses-for-sale/
- https://www.bizbuysell.com/florida/palm-beach-gardens-businesses-for-sale/
- https://www.bizbuysell.com/florida/martin-county-business-assets-for-sale/
- https://www.bizbuysell.com/florida/indian-river-county/pest-control-businesses-for-sale
- https://broker.bizbuysell.com/florida/palm-beach-county-businesses-for-sale
- https://www.bizquest.com/convenience-stores-for-sale-in-fort-pierce-fl
- https://www.bizquest.com/electrical-mechanical-and-hvac-contractors-businesses-for-sale-in-stuart-fl
- https://www.bizquest.com/businesses-for-sale-price-between-250k-500k/ (nationwide, filtered by price)
- https://www.bizquest.com/businesses-for-sale-price-between-500k-1m/ (nationwide, filtered by price)

**Not yet tried:** BizBuySell's own price-plus-radius filter URLs. Build these locally, for example from the Port St. Lucie page with the price filter set to $250K–$1M.

## 3. Current shortlist (from the 2026-11-08 test run)

All figures came from **search snippets and are unverified**. Several conflict across sites.

**SBA debt-service estimate used below:** 12.6% of the asking price per year.

| # | Listing | Location | Ask | Cash flow / SDE | Multiple | Score | Why it fits / caveat |
|---|---|---|---|---|---|---|---|
| 1 | [20+ yr Electric Company](https://www.bizquest.com/business-for-sale/20-year-old-electric-company-in-martin-county-fl/BW2524940/) | Martin County | $799,999 | $287,978 | 2.8× | 8 | Long history; about $187K/yr after debt. Figures conflict across sites. |
| 2 | [Hurricane Protection Co., 26+ yrs](https://www.bizquest.com/business-for-sale/243k-sde-26-year-old-florida-hurricane-shutter-co-seller-financing/BW2497538/) | Jupiter | $655,000 | $243,000 | 2.7× | 7.5 | About $731K revenue; seller support offered. Revenue is seasonal. |
| 3 | South Florida Pole Setters ([index](https://www.bizbuysell.com/florida/stuart-businesses-for-sale/)) | Stuart? | $950,000 | $476,000 | 2.0× | 7 | Strong multiple. Customers may be concentrated; listing URL not yet found. |
| 4 | Concierge Medicine Practice ([index](https://www.bizbuysell.com/florida/palm-beach-gardens-businesses-for-sale/)) | Palm Beach Gardens | $395,000 | $305,109 | 1.3× | 7 | Very cheap. Likely needs a physician owner. |
| 5 | [Pool Service Route](https://loopnet.ca/biz/Business-Opportunity/port-st-lucie-pool-service-route-for-sale/2275193) | PSL / Stuart | $650,000 | $380,684 | 1.7× | 6 | Recurring revenue. The figure may belong to another listing, and it may be "no SBA". |
| 6 | Furniture & Medical Equipment Rental ([index](https://broker.bizbuysell.com/florida/palm-beach-county-businesses-for-sale)) | Riviera Beach | $300,000 | $175,000 | 1.7× | 6.5 | Real estate available. At the edge of the area. |
| 7 | Marathon Gas Station ([index](https://www.bizquest.com/convenience-stores-for-sale-in-fort-pierce-fl)) | Fort Pierce | $325,000 | ~$196,800 | 1.7× | 6.5 | Cash flow looks high for the price, so verify it. Environmental and fuel-contract risk. |
| 8 | Liquor Store, asset sale ([index](https://www.bizbuysell.com/florida/martin-county-business-assets-for-sale/)) | Martin County | $675,000 | $216,592 | 3.1× | 6 | License transfer, lease and inventory are all unknown. |
| 9 | [Audiology Practice](https://businessbroker.net/business-for-sale/professional-audiology-practice-stuart-florida/985599.aspx) | Stuart | $475,000 | $183,142 | 2.6× | 6 | Owner financing offered. Needs a licensed audiologist; price source unconfirmed. |
| 10 | HVAC Co., owner 32 yrs ([index](https://www.bizquest.com/electrical-mechanical-and-hvac-contractors-businesses-for-sale-in-stuart-fl)) | Stuart | $549,000 | $220K? | 2.5×? | 5 | Cash flow unclear: one site shows "-$1". |
| 11 | Pest Control, est. 2008 ([index](https://www.bizbuysell.com/florida/indian-river-county/pest-control-businesses-for-sale)) | Indian River County | $275,000 | not disclosed | – | 5 | Recurring revenue, but no financials. |
| 12 | [Mobil Gas Station](https://www.bizquest.com/business-for-sale/mobil-gas-station-port-st-lucie/BW2463524) | Port St. Lucie | $494,000 | $274,302? | – | 4 | Data conflicts badly across listings. |

The full write-up, with broker questions and an "Also seen" list of 9 more, is in `deal-scout/reports/2026-11-08.md`.

## 4. Scoring and ranking (1–10)

- **Multiple (asking ÷ SDE):** under 2.5× is strong, 2.5–3.5× is fair, over 4× is weak.
- **SBA coverage:** annual debt service ≈ 14% × (90% × price).
  - Flag the listing if SDE minus debt service is under about $60K/yr for the owner.
- **Durability:**
  - 10+ years in business
  - Low dependence on the owner
  - Recurring revenue
  - Diverse customers
  - Seller financing offered
- **Red flags:**
  - No financials
  - "Turnkey" with no numbers
  - Declining sales
  - High franchise royalties
  - Short lease
  - Conflicting figures across sites
- **Ranking:** rank by score. Report the top ~5–12 as "Top picks". Put weaker listings that are still in range under "Also seen".

## 5. Daily email

- **To:** mrsoundsweet@gmail.com
- **Send time:** about **6:49 AM Eastern**, daily. Connor asked for roughly 7 AM ET.
- **Subject:** `Deal Scout – <Mon D, YYYY> – <N> new listings near Port St. Lucie`
- **Body**, in HTML if possible:
  1. A 2–3 line summary
  2. **Top picks**, one per listing:
     - `Title (score/10) — City · Industry · Ask · SDE · Multiple · est. $/yr after SBA debt`
     - Why it's interesting
     - Risks
     - 2–3 broker questions
     - Link
  3. **Also seen:** one-liners
  4. **Updates:** price drops and status changes on listings already in `seen-listings.csv`
  5. **Searches run**
  6. **Footer:** "Figures come from public listings and are unverified. Confirm them with financials and tax returns."
- **If nothing new is found:** still send a short email.
- **Never invent numbers.** Write "not disclosed" when a figure is missing.

## 6. Unfinished or failed

- **Email has never been sent.**
  - The cloud scheduled task couldn't be given the Gmail connector, because connectors can't be attached to scheduled tasks from that session.
  - **Locally:** confirm `/mcp` shows Gmail.
  - Confirm the Gmail tool's server name matches the `mcp__claude_ai_Gmail` entry in `deal-scout/.claude/settings.json`. If the name is different, fix that entry, or headless runs will be refused the send.
- **The Windows scripts are untested.** `run-scout.ps1` and `install-schedule.ps1` were written in a Linux container and never run on Windows.
- **The shortlist is unverified.**
  - No listing page was opened, because direct fetches were blocked in the cloud.
  - Several shortlist links are index pages, not the listing itself.
- **The test run's coverage was incomplete.**
  - Only 14 searches ran.
  - It skipped Sunbelt, Transworld, DealStream, LoopNet and the local brokers.
  - It skipped the towns of Sebastian, Okeechobee and Indiantown.
  - The command file now requires 20+ searches covering every listed source and town.
- **The cloud scheduled task "Deal Scout" is still enabled.**
  - It fires daily at 6:49 AM ET in the cloud and delivers by push notification only, with no email.
  - Disable it once the local runs work, so Connor doesn't get two digests a day.
