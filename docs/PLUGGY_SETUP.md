# Pluggy Open Finance — Setup Guide

End-to-end checklist for wiring up Pluggy on a new (or freshly migrated) Supabase project. The codebase already ships the three edge functions and the events table migration; this guide is the operational glue.

---

## 0 · What's already in the repo

You don't need to write any of this — it's all in `main`:

| Piece | Path | Purpose |
|---|---|---|
| Connect-token edge function | `supabase/functions/pluggy-connect-token/index.ts` | Exchanges your secret credentials for a short-lived token the browser widget uses |
| Sync edge function | `supabase/functions/pluggy-sync/index.ts` | Pulls accounts/transactions from Pluggy on demand and writes them into `transactions` |
| Webhook edge function | `supabase/functions/pluggy-webhook/index.ts` | Receives Pluggy push events; inserts into `pluggy_events` |
| Events table migration | `supabase/migrations/20260424120000_pluggy_events.sql` | Stores webhook events; Realtime delivers them to the browser |
| Connections page | `src/pages/Connections.tsx` | UI: opens widget, lists items, triggers sync |

If any of these are missing, pull `main` first.

---

## 1 · Create a Pluggy account and get credentials

1. Sign up at <https://dashboard.pluggy.ai/> with your business email
2. **Dashboard → Application → Settings**
3. Copy:
   - `clientId` (public, but don't ship it client-side anyway)
   - `clientSecret` (secret — never commits to git, never goes in `VITE_` env vars)
4. Switch to **Production** mode when ready (sandbox connectors are free; production requires a paid plan and KYB approval — start in sandbox)

> **Sandbox vs Production:** Sandbox uses dummy bank accounts (`Pluggy Bank`) with deterministic test data. Switch the dashboard toggle and use a different `clientId/clientSecret` pair for production.

---

## 2 · Set Supabase secrets

Both pairs of credentials live as Supabase secrets — they're injected into edge functions via `Deno.env.get(...)`.

```bash
# From the project root (anywhere with supabase CLI linked):
supabase secrets set PLUGGY_CLIENT_ID=your_client_id_here \
                     PLUGGY_CLIENT_SECRET=your_client_secret_here \
                     --project-ref jmbjvmmmpqkuiescerlm
```

Verify:

```bash
supabase secrets list --project-ref jmbjvmmmpqkuiescerlm
```

You should see `PLUGGY_CLIENT_ID` and `PLUGGY_CLIENT_SECRET` in the output (digests only — values aren't readable after writing).

> **No `VITE_PLUGGY_*` envs.** The client secret never reaches the browser. The frontend only ever calls `pluggy-connect-token`, which mints a short-lived `accessToken` for the widget.

---

## 3 · Apply the events table migration

```bash
supabase db push --project-ref jmbjvmmmpqkuiescerlm
```

This runs `20260424120000_pluggy_events.sql` which:

- Creates `pluggy_events` (user_id, item_id, event_type, event_id, payload, processed)
- Enables RLS — users only read their own events
- Adds the table to the `supabase_realtime` publication so the browser receives `INSERT`s in real time

Confirm in the Supabase dashboard → **Table Editor** → `pluggy_events` exists and shows the policies.

---

## 4 · Deploy the three edge functions

```bash
supabase functions deploy pluggy-connect-token --project-ref jmbjvmmmpqkuiescerlm
supabase functions deploy pluggy-sync          --project-ref jmbjvmmmpqkuiescerlm
supabase functions deploy pluggy-webhook       --project-ref jmbjvmmmpqkuiescerlm
```

Each prints a deployment URL of the form:

```
https://jmbjvmmmpqkuiescerlm.supabase.co/functions/v1/<function-name>
```

Save the **webhook URL** — you need it for step 5.

---

## 5 · Register the webhook in Pluggy

1. Pluggy dashboard → **Webhooks** → **Add Webhook**
2. **URL:** `https://jmbjvmmmpqkuiescerlm.supabase.co/functions/v1/pluggy-webhook`
3. **Events to subscribe to:**
   - `item/created` — first sync after a user connects a bank
   - `item/updated` — Pluggy refreshed transactions in the background
   - `item/error` — connection failed; user must re-authenticate
4. Save

Pluggy will send a `webhook/test` event once. Check Supabase → **Edge Functions → pluggy-webhook → Logs** — you should see `Stored webhook/test for user …`. If the function returns non-2xx Pluggy retries with exponential backoff up to 24h.

> **The 5-second rule.** Pluggy times out webhook handlers at 5 seconds. The `pluggy-webhook` function returns `{received:true}` immediately and processes asynchronously — don't add synchronous DB queries before the response.

---

## 6 · Verify the flow end-to-end

### 6a · Connect a sandbox account

1. Open the app → **Connexões / Connections**
2. Click **Conectar conta** → Pluggy widget opens
3. In sandbox, pick **Pluggy Bank** → username `user-ok` / password `password-ok`
4. Wait for the green check

### 6b · Watch the events arrive

Open Supabase → **SQL Editor**:

```sql
select event_type, item_id, created_at
from pluggy_events
where user_id = auth.uid()
order by created_at desc
limit 10;
```

Within a few seconds you should see `item/created`. The Connections page subscribes via Realtime and triggers `pluggy-sync` automatically — you don't poll.

### 6c · Confirm transactions imported

```sql
select count(*), sum(amount) from transactions where account ilike '%pluggy%';
```

Or check **Fluxo de Caixa** in the app — sandbox transactions appear immediately.

---

## 7 · Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `Pluggy auth failed: 401` in connect-token logs | `PLUGGY_CLIENT_ID/SECRET` typos or wrong environment (sandbox secret in prod app) | Re-run `supabase secrets set …` with values copied directly from Pluggy dashboard |
| Widget opens then immediately errors | `accessToken` expired (>30 min) or `clientUserId` mismatch | Re-mint by calling `pluggy-connect-token` again — token is single-use per session |
| Webhook saves nothing, function returns 200 | Pluggy item's `clientUserId` doesn't match a Supabase user — happens if you created the item before wiring `clientUserId: user.id` in `pluggy-connect-token` | Re-create the item from the Connections page (this passes `clientUserId` properly) |
| Realtime never fires in the browser | The table isn't in the publication, or RLS blocks the SELECT for the user | `select * from pg_publication_tables where pubname = 'supabase_realtime'` should include `pluggy_events` |
| `pluggy-sync` runs but no transactions | The Pluggy item is still `UPDATING` — sync called too early | The webhook flow handles this: only sync after `item/created` or `item/updated`, never on `item/error` |

---

## 8 · Going to production

1. **Pluggy KYB.** Production connectors require Brazilian business approval (CNPJ, contracts). Allow ~1 week.
2. **Switch credentials.** Set the production `PLUGGY_CLIENT_ID/SECRET` via `supabase secrets set` — overwriting the sandbox pair. Re-deploy is **not** needed; secrets refresh on next invocation.
3. **Re-register the webhook** under the production Pluggy account, pointing at the same Supabase URL.
4. **Test with one real bank.** Connect your own account first; verify `item/created` and a real transaction lands in `transactions`.
5. **Cost control.** Pluggy bills per active item per month. Add a UI affordance to disconnect (already in `Connections.tsx`) and a server cron to mark inactive items.

---

## Reference: edge function contracts

### `pluggy-connect-token`

- **Auth:** `Authorization: Bearer <supabase_jwt>` required
- **Body:** `{ itemId?: string }` — pass when re-authenticating an existing item
- **Returns:** `{ accessToken: string }` — single-use token for the widget

### `pluggy-sync`

- **Auth:** `Authorization: Bearer <supabase_jwt>` required
- **Body:** `{ itemId: string }`
- **Returns:** `{ accountsImported: number, transactionsImported: number }`

### `pluggy-webhook`

- **Auth:** **none** — Pluggy doesn't sign payloads with your secret. Treat the URL as the only secret. Optionally add an HMAC check if Pluggy enables one in your account.
- **Body:** `{ event, eventId, itemId, ... }` (Pluggy's webhook envelope)
- **Returns:** `{ received: true }` immediately; processing happens asynchronously
