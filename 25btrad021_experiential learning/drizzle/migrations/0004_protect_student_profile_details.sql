REVOKE SELECT ON public.profiles FROM anon;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
CREATE POLICY "Students can view own full profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE OR REPLACE VIEW public.public_profiles WITH (security_barrier = true) AS SELECT id, display_name, campus FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles (id, display_name, campus, hostel) VALUES (NEW.id, LEFT(COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), split_part(COALESCE(NEW.email,''),'@',1)), 60), LEFT(COALESCE(NEW.raw_user_meta_data->>'campus',''), 100), LEFT(COALESCE(NEW.raw_user_meta_data->>'hostel',''), 100)); RETURN NEW; END; $$;