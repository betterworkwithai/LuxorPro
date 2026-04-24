-- ─────────────────────────────────────────────────────────────────────────────
--  Couples Sharing Mode
--  Tables:   luxor_partnerships
--  RPCs:     accept_partnership_invite, get_partner_shared_transactions,
--             get_partner_info
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Partnerships table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.luxor_partnerships (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_1_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_2_id   uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text        NOT NULL UNIQUE,
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'active', 'ended')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS luxor_partnerships_u1_idx   ON public.luxor_partnerships (user_1_id);
CREATE INDEX IF NOT EXISTS luxor_partnerships_u2_idx   ON public.luxor_partnerships (user_2_id);
CREATE INDEX IF NOT EXISTS luxor_partnerships_code_idx ON public.luxor_partnerships (invite_code);

ALTER TABLE public.luxor_partnerships ENABLE ROW LEVEL SECURITY;

-- Each user can only see partnerships they belong to
CREATE POLICY "Partners read own partnership"
  ON public.luxor_partnerships FOR SELECT
  USING (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- Only user_1 creates
CREATE POLICY "User 1 creates partnership"
  ON public.luxor_partnerships FOR INSERT
  WITH CHECK (auth.uid() = user_1_id);

-- Either partner can update (e.g. set status = 'ended')
CREATE POLICY "Partners update own partnership"
  ON public.luxor_partnerships FOR UPDATE
  USING (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- Either partner can delete
CREATE POLICY "Partners delete own partnership"
  ON public.luxor_partnerships FOR DELETE
  USING (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- updated_at trigger
CREATE TRIGGER set_updated_at_luxor_partnerships
  BEFORE UPDATE ON public.luxor_partnerships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── 2. RPC: accept_partnership_invite ─────────────────────────────────────────
-- SECURITY DEFINER so it can find & update a row by invite_code without the
-- joiner knowing user_1's user_id beforehand.
CREATE OR REPLACE FUNCTION public.accept_partnership_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_partnership record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;

  -- Find the pending, unclaimed partnership (someone else's code)
  SELECT * INTO v_partnership
  FROM public.luxor_partnerships
  WHERE invite_code = p_invite_code
    AND status      = 'pending'
    AND user_2_id   IS NULL
    AND user_1_id  <> v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Código inválido, expirado ou já utilizado');
  END IF;

  -- Accept: link user_2 and activate
  UPDATE public.luxor_partnerships
  SET user_2_id  = v_user_id,
      status     = 'active',
      updated_at = now()
  WHERE id = v_partnership.id;

  RETURN jsonb_build_object(
    'id',         v_partnership.id,
    'partner_id', v_partnership.user_1_id
  );
END;
$$;


-- ── 3. RPC: get_partner_info ──────────────────────────────────────────────────
-- Returns partnership metadata + partner email.
-- Reads auth.users which requires SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_partner_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_partnership record;
  v_partner_id  uuid;
  v_email       text;
BEGIN
  IF v_user_id IS NULL THEN RETURN 'null'::jsonb; END IF;

  -- Active partnership takes priority; also return pending ones (user_1 only)
  SELECT * INTO v_partnership
  FROM public.luxor_partnerships
  WHERE (user_1_id = v_user_id OR user_2_id = v_user_id)
    AND status IN ('pending', 'active')
  ORDER BY
    CASE status WHEN 'active' THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  v_partner_id := CASE
    WHEN v_partnership.user_1_id = v_user_id THEN v_partnership.user_2_id
    ELSE v_partnership.user_1_id
  END;

  IF v_partner_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_partner_id;
  END IF;

  RETURN jsonb_build_object(
    'partnershipId', v_partnership.id,
    'status',        v_partnership.status,
    'inviteCode',    v_partnership.invite_code,
    'partnerEmail',  v_email
  );
END;
$$;


-- ── 4. RPC: get_partner_shared_transactions ───────────────────────────────────
-- SECURITY DEFINER to cross the user_id boundary on luxor_transactions.
-- Only returns rows explicitly marked visibility='shared' for this partnership.
CREATE OR REPLACE FUNCTION public.get_partner_shared_transactions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_partnership record;
  v_partner_id  uuid;
  v_result      jsonb;
BEGIN
  IF v_user_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT * INTO v_partnership
  FROM public.luxor_partnerships
  WHERE status = 'active'
    AND (user_1_id = v_user_id OR user_2_id = v_user_id)
  LIMIT 1;

  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

  v_partner_id := CASE
    WHEN v_partnership.user_1_id = v_user_id THEN v_partnership.user_2_id
    ELSE v_partnership.user_1_id
  END;

  SELECT COALESCE(jsonb_agg(t.data ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.luxor_transactions t
  WHERE t.user_id = v_partner_id
    AND t.data->>'visibility'              = 'shared'
    AND t.data->>'sharedWithPartnershipId' = v_partnership.id::text;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
