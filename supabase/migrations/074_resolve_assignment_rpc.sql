-- Fix: non-admin assignees cannot resolve their assigned cashflow tx.
--
-- Root cause: resolving did a direct `UPDATE cashflow_transactions`. RLS
-- on that table has NO SELECT policy granting an assignee visibility to
-- rows assigned to them (only admin / investor / POS can SELECT). In
-- Postgres an UPDATE must be able to *locate* (SELECT-visible) the rows
-- it modifies, so the assignee's UPDATE silently matched 0 rows even
-- though the dedicated UPDATE policy's USING clause was TRUE. The app
-- read its `count===0` and reported "Forbidden — kamu bukan assignee".
--
-- This is the same reason reads already go through a SECURITY DEFINER
-- RPC (`get_my_needs_assignments`) — the resolve write was simply never
-- migrated to the same pattern.
--
-- Fix: a SECURITY DEFINER RPC that does the ownership/admin check itself
-- and performs the UPDATE with definer privileges (bypassing the
-- SELECT-visibility gap), WITHOUT granting assignees blanket SELECT on
-- the table (so running_balance etc. stay hidden, per original intent).

CREATE OR REPLACE FUNCTION public.resolve_assignment(
  p_row_id UUID,
  p_category TEXT,
  p_branch TEXT,
  p_effective_period_month INT DEFAULT NULL,
  p_effective_period_year INT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_admin();
  v_assignee UUID;
  v_category TEXT;
  v_branch TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF coalesce(btrim(p_category), '') = '' THEN
    RAISE EXCEPTION 'category required' USING errcode = '22023';
  END IF;
  IF coalesce(btrim(p_branch), '') = '' THEN
    RAISE EXCEPTION 'branch required' USING errcode = '22023';
  END IF;

  SELECT assigned_to_user_id, category, branch
    INTO v_assignee, v_category, v_branch
  FROM public.cashflow_transactions
  WHERE id = p_row_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Authorization: admin can resolve anything; otherwise caller must be
  -- the assignee AND the row must still be unresolved (category/branch
  -- still "Needs Assignment"). Mirrors the old RLS predicate exactly.
  IF NOT v_is_admin THEN
    IF v_assignee IS DISTINCT FROM v_uid THEN
      RETURN FALSE;
    END IF;
    IF v_category <> 'Needs Assignment' AND v_branch <> 'Needs Assignment' THEN
      RETURN FALSE;
    END IF;
  END IF;

  UPDATE public.cashflow_transactions
  SET
    category = btrim(p_category),
    branch = btrim(p_branch),
    effective_period_month = COALESCE(p_effective_period_month, effective_period_month),
    effective_period_year = COALESCE(p_effective_period_year, effective_period_year)
  WHERE id = p_row_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_assignment(UUID, TEXT, TEXT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_assignment(UUID, TEXT, TEXT, INT, INT) TO authenticated;
