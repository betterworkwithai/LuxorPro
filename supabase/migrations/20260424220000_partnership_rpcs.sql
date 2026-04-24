-- ─────────────────────────────────────────────────────────────────────────────
--  Additional partnership RPCs so the client never touches
--  luxor_partnerships directly via PostgREST (avoids schema-cache lag).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── create_partnership ────────────────────────────────────────────────────────
-- Ends any existing pending invites for the user, then creates a fresh one.
CREATE OR REPLACE FUNCTION public.create_partnership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code    text;
  v_row     record;
  v_attempt int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;

  -- Expire any previous pending invites this user created
  UPDATE public.luxor_partnerships
  SET status = 'ended', updated_at = now()
  WHERE user_1_id = v_user_id AND status = 'pending';

  -- Try up to 5 times in case of code collision
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 5 THEN
      RETURN jsonb_build_object('error', 'Não foi possível gerar um código único. Tente novamente.');
    END IF;

    -- Random 6-digit code as text (pad with leading zeros if needed)
    v_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');

    BEGIN
      INSERT INTO public.luxor_partnerships (user_1_id, invite_code, status)
      VALUES (v_user_id, v_code, 'pending')
      RETURNING * INTO v_row;

      EXIT; -- success
    EXCEPTION WHEN unique_violation THEN
      CONTINUE; -- retry with a new code
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'id',          v_row.id,
    'user1Id',     v_row.user_1_id,
    'user2Id',     v_row.user_2_id,
    'inviteCode',  v_row.invite_code,
    'status',      v_row.status,
    'createdAt',   v_row.created_at,
    'updatedAt',   v_row.updated_at
  );
END;
$$;


-- ── end_partnership ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_partnership(p_partnership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  UPDATE public.luxor_partnerships
  SET status = 'ended', updated_at = now()
  WHERE id = p_partnership_id
    AND (user_1_id = v_user_id OR user_2_id = v_user_id);
END;
$$;


-- ── Reload PostgREST schema cache so the table becomes visible ────────────────
SELECT pg_notify('pgrst', 'reload schema');
