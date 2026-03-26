# AI Handoff: Product Overview For Naming And Design Exploration

## Goal

Use this document as context for another AI to help with:

- choosing a strong application name
- refining the product positioning
- proposing design changes
- improving the landing page and overall visual identity

This app already works. The next step is not core functionality. The next step is product identity, naming, and visual refinement.

## Current Working State

The app is currently a protected crypto portfolio and market-monitoring workspace built for a real user workflow.

It combines:

- portfolio tracking
- imported transaction history
- coin performance analytics
- live market charts
- exchange market browsing
- per-user saved chart presets

The current placeholder name used in the UI is `Crypto Portfolio Dashboard`. The package name is still generic: `crypto_website`.

That name is functional but weak. It describes the app, but it does not give the product a memorable identity.

## Product Summary

This is a dark-mode crypto analytics workspace focused on:

- tracking a user portfolio
- monitoring live prices and chart activity
- browsing spot markets from Crypto.com Exchange
- managing user-specific chart presets and preferences
- keeping everything behind authentication

The app behaves more like a personal trading and portfolio command center than a simple public market tracker.

## Core User Experience

The current product flow looks like this:

1. A user lands on a public auth page.
2. The user signs in with Supabase auth.
3. The user enters a protected dashboard workspace.
4. The user can switch represented accounts.
5. The user can inspect portfolio performance, imported transactions, live charts, and exchange markets.

This means the app is closer to a private operator console than a consumer marketing site.

## Current Main Sections

### 1. Landing / Auth

Purpose:

- login and signup
- explain the product at a high level
- route authenticated users into the workspace

Current feel:

- polished enough
- still generic
- not strongly branded

### 2. Dashboard

Purpose:

- high-level portfolio health
- allocation view
- top movers
- recent transactions

This is the “overview cockpit” of the app.

### 3. Portfolio

Purpose:

- detailed asset table
- live-enriched portfolio values

This is more analytical and table-driven.

### 4. Transactions

Purpose:

- import CSV exports
- deduplicate imported entries
- inspect transaction history

Current import flow is tied to Crypto.com Exchange exports.

### 5. Coin Performance

Purpose:

- momentum
- drawdown
- volatility
- ATH comparisons

This section is more analytics-oriented than casual portfolio apps.

### 6. Markets

Purpose:

- browse hundreds of Crypto.com Exchange instruments
- filter by quote currency
- search markets
- inspect price, change, high, low, and volume

This page is data-dense and table-heavy.

### 7. Live Charts

Purpose:

- monitor multiple live chart panels at once
- save presets
- sync presets per user
- switch timeframes
- add indicators
- view charts in fullscreen

This is one of the strongest parts of the product and should influence the naming and brand direction.

## Technical Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Supabase auth and persisted user data
- Recharts for dashboard/performance charts
- lightweight-charts for live charts
- Crypto.com Exchange public REST and WebSocket APIs for market data

## Data Model And Product Shape

The app is not just a static dashboard.

It combines two different data worlds:

- user-owned data:
  - auth
  - represented accounts
  - imported transactions
  - saved live-chart presets
  - user preferences
- public market data:
  - tickers
  - candles
  - instrument metadata
  - live WebSocket updates

That mix is important when naming the product. It is both:

- a portfolio intelligence tool
- a live market monitoring workspace

## Current Visual Direction

The UI currently uses:

- dark navy/slate backgrounds
- translucent glass panels in many areas
- sky blue accents
- IBM Plex Sans and IBM Plex Mono
- dense table-heavy layouts
- chart-focused pages

The visual language is professional and technical, but still somewhat generic.

It currently feels like:

- a capable internal dashboard

more than:

- a distinct product with a clear brand personality

## Current Design Strengths

- The app already feels serious and data-focused.
- The dark theme works well for charts.
- Live charts and analytics give it more depth than a basic portfolio tracker.
- The product has enough real functionality to justify a stronger brand identity.
- The user workspace model gives it a “tool” feel instead of a “toy app” feel.

## Current Design Weaknesses

- The name is placeholder-level and not brandable.
- Several screens still feel like admin panels rather than a premium product.
- The visual identity is not yet memorable.
- Some pages are very table-heavy and visually long.
- The landing page explains the app, but does not sell a distinct identity.
- Color usage can drift into green/teal ambience when green should mainly communicate positive performance or success states.

## Brand Positioning That May Fit

The next AI should consider a few possible identity directions.

### Direction A: Portfolio Intelligence

Position the app as a high-clarity portfolio intelligence workspace.

Keywords:

- clarity
- oversight
- intelligence
- signals
- precision
- monitoring

### Direction B: Market Command Center

Position the app as a live operating console for crypto markets and holdings.

Keywords:

- command
- terminal
- cockpit
- desk
- flow
- pulse
- watch

### Direction C: Private Trader Workspace

Position the app as a personal but premium operator environment.

Keywords:

- workspace
- vault
- desk
- cockpit
- control
- portfolio lab

## Naming Constraints

The next AI should propose names that fit these constraints:

- should feel credible and premium
- should not sound childish or meme-like
- should not be too generic, like “Crypto Dashboard Pro”
- should work for a private analytics workspace
- should not lock the brand too tightly to only one exchange
- should ideally work even if the app later expands beyond Crypto.com
- should be short enough to look good in a sidebar, landing page, and logo

## Design Constraints

Any design proposals should respect these constraints:

- keep the app dark and chart-friendly
- preserve strong data density
- keep tables readable
- reserve green mainly for positive P/L and success states
- keep the palette mostly in navy, slate, blue, and neutral tones unless there is a strong concept
- avoid generic “AI SaaS purple” styling
- preserve a premium analytics-tool feel
- work well on desktop first, but still remain usable on mobile

## Opportunities For Design Improvement

The next AI can propose changes in these areas:

- application name
- sidebar brand block
- landing page hero copy
- color system refinement
- typography refinement
- glass vs solid panel strategy
- table styling and density hierarchy
- chart-page visual identity
- badge and status styling
- iconography and motif choices

## Important Product Signals

These elements should probably influence the eventual name and design:

- private authenticated workspace
- represented accounts
- portfolio plus market data in one place
- live chart presets
- multi-panel chart monitoring
- trading-desk feel
- crypto analytics without looking like a meme dashboard

## Good Outcome

A good outcome would give this app:

- a product name that feels intentional
- a clearer brand personality
- a stronger landing page
- a more cohesive visual system
- a design direction that makes the app feel like a polished crypto intelligence workspace

## Suggested Prompt For Another AI

You can paste the section below directly into another AI:

```md
I have a working React + TypeScript crypto analytics application with these sections:

- Dashboard
- Portfolio
- Transactions
- Coin Performance
- Markets
- Live Charts

It uses Supabase auth, user-specific preferences and chart presets, imported transaction history, and live/public market data from Crypto.com Exchange. The current placeholder name is "Crypto Portfolio Dashboard", but I want a stronger product identity.

The app should feel like a premium private crypto workspace or market command center, not a generic admin panel and not a meme-style crypto app.

Please help with:

1. 10 strong product name ideas
2. your top 3 recommended names with reasoning
3. 3 visual design directions for the app
4. recommended color palette and typography direction
5. specific landing page / sidebar branding suggestions
6. how to make the product feel more distinctive while staying dark, analytical, and chart-friendly

Important constraints:

- keep it premium and credible
- keep it dark-mode friendly
- avoid generic "crypto dashboard" naming
- avoid overusing green except for positive states
- preserve the feel of a serious analytics workspace
```

## Useful Code References

If the next AI needs implementation context, these files are the best starting points:

- `src/App.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/pages/LandingPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/MarketsPage.tsx`
- `src/pages/LiveChartsPage.tsx`
- `src/index.css`
- `tailwind.config.ts`
- `docs/market-data-overview.md`
