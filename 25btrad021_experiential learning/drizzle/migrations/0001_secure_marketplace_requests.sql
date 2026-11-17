GRANT SELECT ON public.orders TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
CREATE POLICY "Signed-in students can view item photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'item-photos');

CREATE OR REPLACE FUNCTION public.request_listing(p_item_id UUID, p_days INTEGER DEFAULT 1, p_proposed_item_id UUID DEFAULT NULL, p_note TEXT DEFAULT '') RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_item public.items%ROWTYPE;
  v_offer public.items%ROWTYPE;
  v_days INTEGER;
  v_total NUMERIC(10,2);
  v_order UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to send a request'; END IF;
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.status <> 'available' THEN RAISE EXCEPTION 'This listing is no longer available'; END IF;
  IF v_item.owner_id = v_user THEN RAISE EXCEPTION 'You cannot request your own listing'; END IF;
  IF v_item.mode = 'swap' THEN
    IF p_proposed_item_id IS NULL THEN RAISE EXCEPTION 'Choose one of your available items to offer'; END IF;
    SELECT * INTO v_offer FROM public.items WHERE id = p_proposed_item_id FOR UPDATE;
    IF NOT FOUND OR v_offer.owner_id <> v_user OR v_offer.status <> 'available' OR v_offer.mode <> 'swap' THEN RAISE EXCEPTION 'Your offer must be one of your available swap listings'; END IF;
    v_days := 1;
    v_total := 0;
  ELSIF p_proposed_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Item offers are only used for swaps';
  ELSIF v_item.mode = 'rent' THEN
    v_days := LEAST(GREATEST(COALESCE(p_days, 1), 1), 30);
    v_total := v_item.price * v_days;
  ELSE
    v_days := 1;
    v_total := v_item.price;
  END IF;
  INSERT INTO public.orders (item_id, buyer_id, kind, days, total, proposed_item_id, note)
    VALUES (v_item.id, v_user, v_item.mode, v_days, v_total, p_proposed_item_id, LEFT(COALESCE(p_note, ''), 300)) RETURNING id INTO v_order;
  IF v_item.mode IN ('sell','swap') THEN UPDATE public.items SET status = 'reserved' WHERE id = v_item.id; END IF;
  IF v_item.mode = 'swap' THEN UPDATE public.items SET status = 'reserved' WHERE id = v_offer.id; END IF;
  RETURN v_order;
END;
$$;
REVOKE ALL ON FUNCTION public.request_listing(UUID, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_listing(UUID, INTEGER, UUID, TEXT) TO authenticated;

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
  IF v_order.kind = 'sell' THEN
    UPDATE public.items SET status = CASE WHEN p_status = 'accepted' THEN 'sold' ELSE 'available' END WHERE id = v_item.id;
  ELSIF v_order.kind = 'swap' THEN
    UPDATE public.items SET status = CASE WHEN p_status = 'accepted' THEN 'sold' ELSE 'available' END WHERE id IN (v_item.id, v_order.proposed_item_id);
  END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.update_listing_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_listing_request(UUID, TEXT) TO authenticated;