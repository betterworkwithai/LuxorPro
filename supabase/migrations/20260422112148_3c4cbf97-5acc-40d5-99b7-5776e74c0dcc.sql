-- Luxor cloud-sync schema. One table per data type, all scoped by user_id with RLS.
-- We keep the rich data model identical to the local TypeScript types by storing
-- the full payload in a JSONB `data` column. This avoids brittle column-by-column
-- migrations as the app evolves while preserving per-user isolation via RLS.

-- ─── Transactions ────────────────────────────
CREATE TABLE public.luxor_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text NOT NULL,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX luxor_transactions_user_idx ON public.luxor_transactions (user_id);
ALTER TABLE public.luxor_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own luxor_transactions"
  ON public.luxor_transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_luxor_transactions
  BEFORE UPDATE ON public.luxor_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Investments ─────────────────────────────
CREATE TABLE public.luxor_investments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text NOT NULL,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX luxor_investments_user_idx ON public.luxor_investments (user_id);
ALTER TABLE public.luxor_investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own luxor_investments"
  ON public.luxor_investments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_luxor_investments
  BEFORE UPDATE ON public.luxor_investments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Goals ───────────────────────────────────
CREATE TABLE public.luxor_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text NOT NULL,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX luxor_goals_user_idx ON public.luxor_goals (user_id);
ALTER TABLE public.luxor_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own luxor_goals"
  ON public.luxor_goals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_luxor_goals
  BEFORE UPDATE ON public.luxor_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Recurring Subscriptions ─────────────────
CREATE TABLE public.luxor_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text NOT NULL,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX luxor_subscriptions_user_idx ON public.luxor_subscriptions (user_id);
ALTER TABLE public.luxor_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own luxor_subscriptions"
  ON public.luxor_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_luxor_subscriptions
  BEFORE UPDATE ON public.luxor_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Tax Deductibles ─────────────────────────
CREATE TABLE public.luxor_tax_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text NOT NULL,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX luxor_tax_items_user_idx ON public.luxor_tax_items (user_id);
ALTER TABLE public.luxor_tax_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own luxor_tax_items"
  ON public.luxor_tax_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_luxor_tax_items
  BEFORE UPDATE ON public.luxor_tax_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Settings (one row per user) ─────────────
CREATE TABLE public.luxor_settings (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.luxor_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own luxor_settings"
  ON public.luxor_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at_luxor_settings
  BEFORE UPDATE ON public.luxor_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();