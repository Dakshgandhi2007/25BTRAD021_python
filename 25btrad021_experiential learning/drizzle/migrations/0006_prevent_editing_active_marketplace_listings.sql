CREATE OR REPLACE FUNCTION public.guard_marketplace_item_changes() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.owner_id <> auth.uid() THEN RAISE EXCEPTION 'You can only edit your own listings'; END IF;
  IF OLD.status <> 'available' THEN RAISE EXCEPTION 'Only available listings can be edited'; END IF;
  IF (to_jsonb(NEW) - 'description' - 'wanted' - 'condition' - 'photo_url' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'description' - 'wanted' - 'condition' - 'photo_url' - 'updated_at') THEN
    IF EXISTS (SELECT 1 FROM public.orders o WHERE o.item_id = OLD.id AND o.status = 'pending') THEN RAISE EXCEPTION 'This listing has a pending request and cannot be changed yet'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_marketplace_item_changes ON public.items;
CREATE TRIGGER guard_marketplace_item_changes BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.guard_marketplace_item_changes();