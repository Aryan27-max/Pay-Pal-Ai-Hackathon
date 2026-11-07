---
name: ag-grid-dashboard
description: Use for the public transparency dashboard and donor receipts — AG Grid Community setup, columns, status colours, explorer links, live refresh and the redacted public feed.
---

# ag-grid-dashboard

## Purpose
Demo moment 4: "where did the money go" must be obvious in 5 seconds. Judged on Design.

## Files it owns
- `app/dashboard/Dashboard.tsx` (client, AG Grid), `app/dashboard/page.tsx`
- `app/receipt/[id]/page.tsx`, `lib/public/receipt.ts`, `app/api/receipts/[donorPublicId]/route.ts`
- `lib/public/feed.ts` + `app/api/trail/route.ts` (the only data source for the dashboard)

## AG Grid Community 36 (MIT, free)
```ts
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({ accentColor: "#059669", fontFamily: "inherit", headerBackgroundColor: "#f8fafc", wrapperBorderRadius: 12 });
<AgGridReact theme={theme} rowData={rows} columnDefs={cols} domLayout="autoHeight" pagination paginationPageSize={20} />
```
- Object-valued columns (funded-by list, trail ref) need `cellDataType: false` (else warning #48).
- Wrapped text: `wrapText + autoHeight` AND a `cellStyle` line-height (the theme's row line-height is huge).

## Layout
Headline → 4 tiles (donated, **paid directly to people**, in the pool, stopped by checks) → money-flow bar
(paid / in flight / available) → tabs: Payouts (FIFO "funded by" chips linking to receipts), Decisions (score bar,
deterministic reason), Donations, Claims (SIMULATED badge), On-chain records (memo + explorer link). Refresh 5 s.
Claim ids show the short code used on receipts (e.g. `16D9`), full id on hover.

## Privacy (privacy-guard)
Public ids, ~10 km cells, amounts, statuses, PayPal batch/capture ids, signatures only. Engine reasons are
code-generated; reviewer reasons are never shown (hash on chain). Postman asserts no email in `/api/trail`.

## Test
`npm run test:api` (feed redaction + memo format) · screenshots via Playwright · `npm run demo` then open `/dashboard`.
