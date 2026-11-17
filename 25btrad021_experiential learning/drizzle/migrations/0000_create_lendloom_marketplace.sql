CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name TEXT NOT NULL, campus TEXT NOT NULL DEFAULT '', hostel TEXT NOT NULL DEFAULT '', avatar_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are publicly readable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL CHECK (category IN ('books','electronics','clothing','home','sports','other')), mode TEXT NOT NULL CHECK (mode IN ('swap','rent','sell')), price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0), wanted TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new','like_new','good','fair')), photo_url TEXT, status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold','archived')), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT ON public.items TO anon;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Available items are public" ON public.items FOR SELECT TO anon, authenticated USING (status = 'available' OR owner_id = auth.uid());
CREATE POLICY "Students create own items" ON public.items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Students edit own items" ON public.items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Students delete own items" ON public.items FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE INDEX items_browse_idx ON public.items (status, category, mode, created_at DESC);
CREATE INDEX items_owner_idx ON public.items (owner_id, created_at DESC);

CREATE TABLE public.orders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE, buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('swap','rent','sell')), days INTEGER NOT NULL DEFAULT 1 CHECK (days BETWEEN 1 AND 30), total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0), status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed','cancelled')), proposed_item_id UUID REFERENCES public.items(id) ON DELETE SET NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view orders" ON public.orders FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.items WHERE items.id = orders.item_id AND items.owner_id = auth.uid()));
CREATE POLICY "Students create own requests" ON public.orders FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.items WHERE items.id = orders.item_id AND items.owner_id = auth.uid()));
CREATE POLICY "Participants update order status" ON public.orders FOR UPDATE TO authenticated USING (buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.items WHERE items.id = orders.item_id AND items.owner_id = auth.uid())) WITH CHECK (buyer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.items WHERE items.id = orders.item_id AND items.owner_id = auth.uid()));
CREATE INDEX orders_buyer_idx ON public.orders (buyer_id, created_at DESC);
CREATE INDEX orders_item_idx ON public.orders (item_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), split_part(COALESCE(NEW.email,''),'@',1))); RETURN NEW; END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Students upload own item photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'item-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Students update own item photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'item-photos' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'item-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Students delete own item photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'item-photos' AND (storage.foldername(name))[1] = auth.uid()::text);