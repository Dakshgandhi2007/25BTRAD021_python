GRANT SELECT ON storage.objects TO anon, authenticated;
DROP POLICY IF EXISTS "Signed-in students can view item photos" ON storage.objects;
CREATE POLICY "Anyone can view marketplace item photos" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'item-photos');
CREATE OR REPLACE FUNCTION public.update_listing_request(p_order_id UUID, p_status TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_owner BOOLEAN;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to update a request'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT * INTO v_item FROM public.items WHERE id = v_order.item_id FOR UPDATE;
  v_owner := v_item.owner_id = v_user;
  IF p_status = 'completed' THEN
    IF v_order.kind <> 'rent' OR v_order.status <> 'accepted' OR (v_order.buyer_id <> v_user AND NOT v_owner) THEN RAISE EXCEPTION 'Only participants in an accepted rental can mark it returned'; END IF;
    UPDATE public.orders SET status = 'completed' WHERE id = v_order.id;
    UPDATE public.items SET status = 'available' WHERE id = v_item.id AND status = 'reserved';
    RETURN TRUE;
  END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been handled'; END IF;
  IF p_status = 'cancelled' THEN
    IF v_order.buyer_id <> v_user THEN RAISE EXCEPTION 'Only the requester can cancel this request'; END IF;
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_order.id;
    IF v_order.kind IN ('sell','swap') THEN UPDATE public.items SET status = 'available' WHERE id = v_item.id AND status = 'reserved'; END IF;
    IF v_order.kind = 'swap' THEN UPDATE public.items SET status = 'available' WHERE id = v_order.proposed_item_id AND status = 'reserved'; END IF;
    RETURN TRUE;
  END IF;
  IF NOT v_owner OR p_status NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Only the listing owner can accept or decline a request'; END IF;
  UPDATE public.orders SET status = p_status WHERE id = v_order.id;
  IF v_order.kind = 'rent' AND p_status = 'accepted' THEN
    UPDATE public.items SET status = 'reserved' WHERE id = v_item.id;
    UPDATE public.orders SET status = 'declined' WHERE item_id = v_item.id AND id <> v_order.id AND status = 'pending';
  ELSIF v_order.kind = 'sell' THEN
    UPDATE public.items SET status = CASE WHEN p_status = 'accepted' THEN 'sold' ELSE 'available' END WHERE id = v_item.id;
  ELSIF v_order.kind = 'swap' THEN
    UPDATE public.items SET status = CASE WHEN p_status = 'accepted' THEN 'sold' ELSE 'available' END WHERE id IN (v_item.id, v_order.proposed_item_id);
  END IF;
  RETURN TRUE;
END;
$$;