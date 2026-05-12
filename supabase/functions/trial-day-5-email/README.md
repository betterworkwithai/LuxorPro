# trial-day-5-email

Cron-triggered edge function. Sends a personalized "Você tem N dias restantes —
aqui está sua pirâmide patrimonial" email to every user who is currently on
trial day 5 of 7 and hasn't been emailed yet.

Idempotent: stamps `profiles.trial_day5_email_sent_at` after a successful send.

## Setup

### 1. Deploy the function

```bash
supabase functions deploy trial-day-5-email
```

### 2. Run the migration

```bash
supabase db push
```

Adds `trial_day5_email_sent_at` column + partial index.

### 3. Set required secrets

In **Supabase Dashboard → Edge Functions → trial-day-5-email → Secrets**:

| Key                          | Value                                                      |
|------------------------------|------------------------------------------------------------|
| `RESEND_API_KEY`             | Resend API key (`re_...`) from https://resend.com/api-keys |
| `RESEND_FROM_EMAIL`          | `Luxor Pro <suporte@luxorpro.com.br>` (must be a verified Resend sender) |
| `CRON_SECRET`                | Any long random string. Shared between cron and the function. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

### 4. Schedule it daily

Pick one of:

**Option A — pg_cron (in Supabase SQL editor):**

```sql
-- Once: ensure extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule daily at 15:00 UTC (12:00 BRT)
select cron.schedule(
  'luxor-trial-day-5-email',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://jmbjvmmmpqkuiescerlm.supabase.co/functions/v1/trial-day-5-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <CRON_SECRET-here>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

To inspect: `select * from cron.job;`
To unschedule: `select cron.unschedule('luxor-trial-day-5-email');`

**Option B — GitHub Actions:**

`.github/workflows/trial-emails.yml`:

```yaml
name: trial-emails
on:
  schedule: [{ cron: "0 15 * * *" }]
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sS -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://jmbjvmmmpqkuiescerlm.supabase.co/functions/v1/trial-day-5-email
```

Add `CRON_SECRET` to the repo's Actions secrets.

## Manual testing

Hit the function with `?dryRun=1` to see who would receive the email
without actually sending or stamping:

```bash
curl -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://jmbjvmmmpqkuiescerlm.supabase.co/functions/v1/trial-day-5-email?dryRun=1"
```

The response includes a `results` array showing each eligible user, their
computed patrimônio, and the pyramid tier they'd be told about.
