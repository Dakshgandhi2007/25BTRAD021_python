CREATE OR REPLACE FUNCTION public.can_view_marketplace_item(p_item_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i WHERE i.id = p_item_id AND (
      i.status = 'available'
      OR i.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE (o.item_id = i.id OR o.proposed_item_id = i.id)
          AND (o.buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.items parent_item WHERE parent_item.id = o.item_id AND parent_item.owner_id = auth.uid()))
      )
    )
  )
$$;