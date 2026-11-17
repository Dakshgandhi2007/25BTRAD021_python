GRANT SELECT ON public.profiles TO anon;
CREATE OR REPLACE FUNCTION public.can_view_marketplace_item(p_item_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.items i WHERE i.id = p_item_id AND (i.status = 'available' OR i.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.orders o WHERE o.item_id = i.id AND (o.buyer_id = auth.uid() OR i.owner_id = auth.uid()))))
$$;
REVOKE ALL ON FUNCTION public.can_view_marketplace_item(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_marketplace_item(UUID) TO anon, authenticated;
DROP POLICY IF EXISTS "Available items are public" ON public.items;
CREATE POLICY "Available and participating students can view items" ON public.items FOR SELECT TO anon, authenticated USING (public.can_view_marketplace_item(id));