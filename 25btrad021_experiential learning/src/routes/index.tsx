import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  ArrowDownUp, ArrowRight, BookOpen, Check, ChevronDown, Clock3, GraduationCap,
  Heart, Home, Laptop, ListFilter, LoaderCircle, LogOut, MapPin, Menu, PackageCheck,
  Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Tag, X,
} from "lucide-react";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import campusTable from "@/assets/campus-exchange-table.jpg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { clampRentalDays, LISTING_PHOTO_TYPES, MAX_LISTING_PHOTO_BYTES, rentalTotal } from "@/lib/marketplace-rules";

type Category = "books" | "electronics" | "clothing" | "home" | "sports" | "other";
type ListingMode = "swap" | "rent" | "sell";
type ListingStatus = "available" | "reserved" | "sold" | "archived";
type OrderStatus = "pending" | "accepted" | "declined" | "completed" | "cancelled";
type FilterMode = "all" | ListingMode;
type Profile = { id: string; display_name: string; campus: string; hostel: string; avatar_url: string | null };
type PublicProfile = Pick<Profile, "id" | "display_name" | "campus">;
type Listing = {
  id: string; owner_id: string; title: string; description: string; category: Category; mode: ListingMode;
  price: number; wanted: string; condition: string; photo_url: string | null; status: ListingStatus;
  created_at: string; updated_at?: string; profiles?: Profile | null;
};
type Order = {
  id: string; item_id: string; buyer_id: string; kind: ListingMode; days: number; total: number;
  status: OrderStatus; proposed_item_id: string | null; note: string; created_at: string;
};
type Surface = "listings" | "my-stuff" | "requests";

const CATEGORIES: { id: "all" | Category; label: string; icon: typeof BookOpen }[] = [
  { id: "all", label: "All finds", icon: Sparkles }, { id: "books", label: "Books", icon: BookOpen },
  { id: "electronics", label: "Tech", icon: Laptop }, { id: "clothing", label: "Clothing", icon: Tag },
  { id: "home", label: "Room & home", icon: Home }, { id: "sports", label: "Sports", icon: ArrowDownUp },
  { id: "other", label: "Other", icon: PackageCheck },
];
const CATEGORY_TINT: Record<Category, string> = { books: "bg-sky", electronics: "bg-secondary", clothing: "bg-accent", home: "bg-cream", sports: "bg-lime", other: "bg-muted" };
const formatPrice = (amount: number) => `₹${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(value));
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "L";

async function resolvePhotoUrls(rows: Listing[]) {
  return Promise.all(rows.map(async (item) => {
    if (!item.photo_url) return item;
    const savedPath = item.photo_url.includes("/item-photos/")
      ? item.photo_url.split("/item-photos/").at(-1)?.split("?")[0] ?? item.photo_url
      : item.photo_url;
    const { data, error } = await supabase.storage.from("item-photos").createSignedUrl(decodeURIComponent(savedPath), 3600);
    return { ...item, photo_url: error ? null : data.signedUrl };
  }));
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Lendloom — Campus exchange, made easy" },
    { name: "description", content: "Find a little more in what your campus already has. Swap, borrow, rent, and sell with Lendloom." },
    { property: "og:title", content: "Lendloom — Campus exchange, made easy" },
    { property: "og:description", content: "A more thoughtful way to find what you need around campus." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LendloomMarketplace,
});

function LendloomMarketplace() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [surface, setSurface] = useState<Surface>("listings");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [mode, setMode] = useState<FilterMode>("all");
  const [sort, setSort] = useState("recent");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authError, setAuthError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [days, setDays] = useState(3);
  const [offerId, setOfferId] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [authValues, setAuthValues] = useState({ name: "", campus: "", hostel: "", email: "", password: "" });
  const [listValues, setListValues] = useState({ title: "", description: "", category: "books" as Category, mode: "swap" as ListingMode, price: "", wanted: "", condition: "good" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  const loadListings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("items").select("*").eq("status", "available").order("created_at", { ascending: false }).limit(60);
    if (error) {
      toast.error("We couldn't load the campus listings. Please try again.");
      setItems([]);
      setLoading(false);
      return;
    }
    const rows = await resolvePhotoUrls((data ?? []) as Listing[]);
    const { data: { user: authenticatedUser } } = await supabase.auth.getUser();
    const [visibleOrders, ownListings] = authenticatedUser
      ? await Promise.all([
          supabase.from("orders").select("item_id,proposed_item_id"),
          supabase.from("items").select("*").eq("owner_id", authenticatedUser.id),
        ])
      : [{ data: [] }, { data: [] }];
    const orderRows = (visibleOrders.data ?? []) as Pick<Order, "item_id" | "proposed_item_id">[];
    const relatedIds = [...new Set(orderRows.flatMap((order) => [order.item_id, order.proposed_item_id].filter((id): id is string => Boolean(id))))];
    const { data: relatedItems } = relatedIds.length ? await supabase.from("items").select("*").in("id", relatedIds) : { data: [] };
    const participantIds = [...new Set((visibleOrders.data ?? []).map((order) => order.item_id))];
    const { data: participantItems } = authenticatedUser && participantIds.length
      ? await supabase.from("items").select("*").in("id", participantIds)
      : { data: [] };
    const privateRows = await resolvePhotoUrls([...(relatedItems ?? []) as Listing[], ...(participantItems ?? []) as Listing[], ...(ownListings.data ?? []) as Listing[]]);
    const combined = [...rows, ...privateRows].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
    const ownerIds = [...new Set(combined.map((item) => item.owner_id))];
    const { data: ownerRows } = ownerIds.length ? await supabase.from("public_profiles").select("id,display_name,campus").in("id", ownerIds) : { data: [] };
    const ownerMap = Object.fromEntries(((ownerRows ?? []) as Profile[]).map((row) => [row.id, row]));
    setProfiles((previous) => ({ ...previous, ...ownerMap }));
    setItems((current) => [...combined, ...current.filter((item) => item.status === "reserved" && !combined.some((other) => other.id === item.id))].map((item) => ({ ...item, profiles: ownerMap[item.owner_id] ?? item.profiles ?? null })));
    setLoading(false);
  }, []);

  const loadMyStuff = useCallback(async (activeUser: User) => {
    const [profileResult, itemResult, orderResult] = await Promise.all([
      supabase.from("profiles").select("id,display_name,campus,hostel,avatar_url").eq("id", activeUser.id).maybeSingle(),
      supabase.from("items").select("*").eq("owner_id", activeUser.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
    ]);
    if (profileResult.data) setProfile(profileResult.data as Profile);
    if (itemResult.data) setItems(await resolvePhotoUrls((itemResult.data ?? []) as Listing[]));
    if (orderResult.data) {
      const rows = orderResult.data as Order[];
      setOrders(rows);
      const itemIds = [...new Set(rows.map((order) => order.item_id))];
      const peopleIds = [...new Set(rows.map((order) => order.buyer_id))];
      const [requestItems, people] = await Promise.all([
        itemIds.length ? supabase.from("items").select("*").in("id", itemIds) : Promise.resolve({ data: [] }),
        peopleIds.length ? supabase.from("public_profiles").select("id,display_name,campus").in("id", peopleIds) : Promise.resolve({ data: [] }),
      ]);
      const resolvedRequestItems = await resolvePhotoUrls((requestItems.data ?? []) as Listing[]);
      const requestItemMap = Object.fromEntries(resolvedRequestItems.map((item) => [item.id, item]));
      const allPeopleIds = [...new Set([...peopleIds, ...resolvedRequestItems.map((item) => item.owner_id)])];
      const { data: allPeople } = allPeopleIds.length ? await supabase.from("public_profiles").select("id,display_name,campus").in("id", allPeopleIds) : { data: [] };
      setProfiles((previous) => ({ ...previous, ...Object.fromEntries(((allPeople ?? []) as PublicProfile[]).map((person) => [person.id, { ...person, hostel: "", avatar_url: null }])) }));
      setItems((current) => {
        const ownItems = Object.fromEntries(current.map((item) => [item.id, item]));
        return [...Object.values(requestItemMap), ...current].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index).map((item) => ownItems[item.id] ?? item);
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (data.user) { setUser(data.user); await loadMyStuff(data.user); }
      if (active) await loadListings();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        window.setTimeout(() => void loadMyStuff(session.user), 0);
      }
      if (event === "SIGNED_OUT") {
        setUser(null); setProfile(null); setOrders([]); setSurface("listings");
        window.setTimeout(() => void loadListings(), 0);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [loadListings, loadMyStuff]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (surface === "listings" && item.status !== "available") return false;
      if (surface === "my-stuff" && item.owner_id !== user?.id) return false;
      if (surface === "requests") return false;
      const owner = item.profiles ?? profiles[item.owner_id];
      const text = `${item.title} ${item.description} ${item.category} ${item.wanted} ${owner?.campus ?? ""} ${owner?.display_name ?? ""}`.toLowerCase();
      return (!query || text.includes(query)) && (category === "all" || item.category === category) && (mode === "all" || item.mode === mode);
    });
    if (sort === "price-low") rows.sort((a, b) => a.price - b.price);
    if (sort === "price-high") rows.sort((a, b) => b.price - a.price);
    return rows;
  }, [category, items, mode, profiles, search, sort, surface, user?.id]);
  const offerItems = useMemo(() => items.filter((item) => item.owner_id === user?.id && item.mode === "swap" && item.status === "available"), [items, user?.id]);
  const incomingOrders = orders.filter((order) => items.some((item) => item.id === order.item_id && item.owner_id === user?.id));
  const outgoingOrders = orders.filter((order) => order.buyer_id === user?.id);
  const pendingInbox = incomingOrders.filter((order) => order.status === "pending").length;

  function openAuth(nextMode: "signin" | "signup" = "signin") {
    setAuthMode(nextMode); setAuthError(""); setConfirmationMessage(""); setAuthOpen(true);
  }
  function askToList() {
    if (!user) { openAuth("signup"); return; }
    setPhoto(null); setPreview(""); setListOpen(true);
  }
  async function updateProfile(nextUser: User, values: { name?: string; campus?: string; hostel?: string }) {
    const name = values.name?.trim() || nextUser.user_metadata?.["display_name"] || nextUser.user_metadata?.["name"] || nextUser.email?.split("@")[0] || "Student";
    const { data: existingProfile } = await supabase.from("profiles").select("campus,hostel").eq("id", nextUser.id).maybeSingle();
    const { data } = await supabase.from("profiles").upsert({ id: nextUser.id, display_name: name, campus: values.campus?.trim() ?? existingProfile?.campus ?? "", hostel: values.hostel?.trim() ?? existingProfile?.hostel ?? "" }, { onConflict: "id" }).select("id,display_name,campus,hostel,avatar_url").single();
    if (data) setProfile(data as Profile);
  }
  async function signInWithProvider(provider: "google" | "lovable") {
    setPending(true); setAuthError("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) setAuthError(result.error.message);
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Couldn't start sign-in."); }
    finally { setPending(false); }
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setAuthError("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authValues.email.trim(), password: authValues.password, options: { emailRedirectTo: window.location.origin, data: { display_name: authValues.name.trim(), campus: authValues.campus.trim(), hostel: authValues.hostel.trim() } } });
        if (error) throw error;
        if (!data.session) { setConfirmationMessage("Check your inbox to confirm your email. Once confirmed, you can sign in and start exchanging."); return; }
        const createdUser = data.user;
        if (!createdUser) throw new Error("Your account was created, but we couldn't load your student profile yet.");
        await updateProfile(createdUser, authValues); setUser(createdUser); setAuthOpen(false);
        setAuthValues({ name: "", campus: "", hostel: "", email: "", password: "" }); toast.success("Welcome to Lendloom");
        await loadMyStuff(createdUser);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authValues.email.trim(), password: authValues.password });
        if (error) throw error;
        const signedInUser = data.user;
        if (!signedInUser) throw new Error("We couldn't load your account. Please try again.");
        await updateProfile(signedInUser, {}); setUser(signedInUser); setAuthOpen(false);
        setAuthValues({ name: "", campus: "", hostel: "", email: "", password: "" }); toast.success("You're signed in");
        await loadMyStuff(signedInUser);
      }
      await loadListings();
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setPending(false); }
  }
  async function signOut() { await supabase.auth.signOut(); toast.success("You're signed out"); }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) { openAuth("signin"); return; }
    setPending(true);
    try {
      let photoUrl: string | null = null;
      if (photo) {
        if (!LISTING_PHOTO_TYPES.includes(photo.type as (typeof LISTING_PHOTO_TYPES)[number])) throw new Error("Choose a JPG, PNG, or WebP photo.");
        if (photo.size > MAX_LISTING_PHOTO_BYTES) throw new Error("Photos need to be under 3 MB.");
        const path = `${user.id}/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        photoUrl = path;
      }
      const { error } = await supabase.from("items").insert({ owner_id: user.id, title: listValues.title.trim(), description: listValues.description.trim(), category: listValues.category, mode: listValues.mode, price: listValues.mode === "swap" ? 0 : Number(listValues.price), wanted: listValues.mode === "swap" ? listValues.wanted.trim() : "", condition: listValues.condition, ...(photoUrl ? { photo_url: photoUrl } : {}) });
      if (error) throw error;
      setListOpen(false); setListValues({ title: "", description: "", category: "books", mode: "swap", price: "", wanted: "", condition: "good" }); setPhoto(null); setPreview(""); setSurface("listings");
      await loadListings(); toast.success("Your listing is live on campus");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't publish this listing."); }
    finally { setPending(false); }
  }
  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !user) { openAuth("signin"); return; }
    setPending(true);
    const { error } = await supabase.rpc("request_listing", { p_item_id: selected.id, p_days: selected.mode === "rent" ? clampRentalDays(days) : 1, ...(selected.mode === "swap" ? { p_proposed_item_id: offerId } : {}), p_note: "" });
    if (error) toast.error(error.message);
    else {
      toast.success(selected.mode === "swap" ? "Swap offer sent" : selected.mode === "rent" ? "Rental request sent" : "Purchase request sent");
      setSelected(null); setOfferId(""); await Promise.all([loadListings(), loadMyStuff(user)]);
    }
    setPending(false);
  }
  async function handleOrderStatus(order: Order, status: OrderStatus) {
    setPending(true);
    const { error } = await supabase.rpc("update_listing_request", { p_order_id: order.id, p_status: status });
    if (error) toast.error(error.message);
    else { toast.success(status === "completed" ? "Rental marked as returned" : `Request ${status}`); if (user) await loadMyStuff(user); await loadListings(); }
    setPending(false);
  }
  async function removeListing(itemId: string) {
    const { error } = await supabase.from("items").delete().eq("id", itemId);
    if (error) toast.error("Couldn't remove that listing.");
    else { toast.success("Listing removed"); if (user) await loadMyStuff(user); await loadListings(); }
  }
  function currentNav(next: Surface) {
    setSurface(next); setMobileNav(false);
    if (next === "listings") window.setTimeout(() => document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" }), 40);
  }

  return (
    <main className="site-shell bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="page-container flex min-h-[4.4rem] items-center justify-between gap-3">
          <button type="button" aria-label="Lendloom home" onClick={() => { currentNav("listings"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex shrink-0 items-center gap-2 text-left"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><ArrowDownUp className="size-5" /></span><span className="display-type text-[1.25rem] font-extrabold leading-none tracking-normal">lendloom<span className="text-coral">.</span></span></button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation"><Button variant={surface === "listings" ? "secondary" : "ghost"} size="sm" onClick={() => currentNav("listings")}>Explore</Button>{user && <><Button variant={surface === "requests" ? "secondary" : "ghost"} size="sm" onClick={() => currentNav("requests")}>Requests{pendingInbox > 0 && <span className="ml-1 grid size-5 place-items-center rounded-full bg-coral text-[0.65rem] font-bold text-primary-foreground">{pendingInbox}</span>}</Button><Button variant={surface === "my-stuff" ? "secondary" : "ghost"} size="sm" onClick={() => currentNav("my-stuff")}>My listings</Button></>}</nav>
          <div className="flex items-center gap-2">{user ? <><Button variant="primary" size="sm" onClick={askToList}><Plus className="size-4" /><span className="hidden sm:inline">List an item</span><span className="sm:hidden">List</span></Button><button type="button" className="hidden items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted sm:flex" onClick={() => currentNav("my-stuff")} aria-label={`Signed in as ${profile?.display_name ?? user.email ?? "student"}`}><span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{initials(profile?.display_name ?? user.email ?? "Student")}</span><span className="max-w-[7rem] truncate text-sm font-semibold">{profile?.display_name?.split(" ")[0] ?? "My account"}</span></button><Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut className="size-4" /></Button></> : <><Button variant="ghost" size="sm" onClick={() => openAuth("signin")}>Log in</Button><Button variant="primary" size="sm" onClick={() => openAuth("signup")}><span className="hidden sm:inline">Join campus</span><span className="sm:hidden">Join</span><ArrowRight className="size-4" /></Button></>}<Button variant="ghost" size="icon" aria-label="Open navigation" className="md:hidden" onClick={() => setMobileNav(!mobileNav)}>{mobileNav ? <X className="size-5" /> : <Menu className="size-5" />}</Button></div>
        </div>
        {mobileNav && <div className="page-container grid gap-1 border-t border-border py-3 md:hidden"><Button variant="ghost" className="justify-start" onClick={() => currentNav("listings")}>Explore campus listings</Button>{user && <><Button variant="ghost" className="justify-start" onClick={() => currentNav("requests")}>Requests{pendingInbox > 0 ? ` · ${pendingInbox} new` : ""}</Button><Button variant="ghost" className="justify-start" onClick={() => currentNav("my-stuff")}>My listings</Button></>}</div>}
      </header>

      <section className="relative overflow-hidden border-b border-border bg-cream">
        <div className="page-container grid items-center gap-9 py-10 sm:py-14 md:grid-cols-[1fr_0.92fr] md:gap-12 md:py-16">
          <div className="relative z-10 max-w-[38rem]"><div className="mb-5 inline-flex items-center gap-2 rounded-sm border border-primary/15 bg-background/70 px-3 py-1.5 text-xs font-semibold text-primary"><GraduationCap className="size-4" /> Made for campus life <span aria-hidden="true" className="text-border">·</span><span className="text-muted-foreground">and the people in it</span></div><h1 className="display-type max-w-[11ch] text-[2.85rem] font-extrabold leading-[1.06] tracking-normal sm:text-6xl">Good things go <span className="text-primary">further</span> together.</h1><p className="mt-5 max-w-[43ch] text-base leading-7 text-muted-foreground sm:text-lg">Your next textbook, floor lamp or weekend fit might already be down the hall. Swap, borrow, rent, or pass it on.</p><div className="mt-7 flex flex-wrap items-center gap-3"><Button variant="primary" size="lg" onClick={() => { currentNav("listings"); document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" }); }}>Find your next thing <ArrowRight className="size-4" /></Button><Button variant="outline" size="lg" onClick={askToList}><Plus className="size-4" /> Share something</Button></div><div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Student community</span><span className="inline-flex items-center gap-2"><MapPin className="size-4 text-primary" /> Meet on campus</span><span className="inline-flex items-center gap-2"><Heart className="size-4 text-coral" /> Less waste, more use</span></div></div>
          <div className="relative min-w-0"><img src={campusTable} alt="Everyday study essentials ready to find a new student owner" width={1024} height={1024} fetchPriority="high" className="aspect-[1.04/1] w-full object-cover object-center md:aspect-[1.03/0.92]" /><div className="absolute bottom-4 left-4 flex items-center gap-3 border border-border/70 bg-background/95 px-3 py-2.5 soft-shadow sm:bottom-6 sm:left-6 sm:px-4"><span className="grid size-9 place-items-center bg-secondary text-primary"><ArrowDownUp className="size-5" /></span><span><span className="block text-sm font-bold">A better kind of back-and-forth</span><span className="mt-0.5 block text-xs text-muted-foreground">Find it. Trade it. Keep it moving.</span></span></div><span className="absolute right-3 top-3 bg-lime px-3 py-1.5 text-xs font-bold text-foreground sm:right-5 sm:top-5">Made for students, by students</span></div>
        </div>
      </section>

      <section aria-label="How it works" className="border-b border-border bg-background"><div className="page-container grid gap-5 py-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border sm:py-6"><div className="flex items-center gap-3 sm:px-5 sm:first:pl-0"><span className="grid size-9 shrink-0 place-items-center bg-secondary text-primary"><Search className="size-4" /></span><span><b className="block text-sm">Find nearby</b><span className="text-xs text-muted-foreground">Real listings from your campus</span></span></div><div className="flex items-center gap-3 sm:px-5"><span className="grid size-9 shrink-0 place-items-center bg-accent text-accent-foreground"><ArrowDownUp className="size-4" /></span><span><b className="block text-sm">Choose your way</b><span className="text-xs text-muted-foreground">Swap, rent, or buy directly</span></span></div><div className="flex items-center gap-3 sm:px-5 sm:last:pr-0"><span className="grid size-9 shrink-0 place-items-center bg-lime text-foreground"><MapPin className="size-4" /></span><span><b className="block text-sm">Meet on campus</b><span className="text-xs text-muted-foreground">Keep good things in circulation</span></span></div></div></section>

      <section id="browse" className="page-container scroll-mt-24 py-10 sm:py-14">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary"><span className="size-2 rounded-full bg-coral" /> THE CAMPUS BOARD</div><h2 className="display-type text-3xl font-extrabold tracking-normal sm:text-4xl">Find your next <span className="text-primary">good thing.</span></h2><p className="mt-2 text-sm text-muted-foreground">Useful finds, listed by students around you.</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-full bg-secondary text-primary"><GraduationCap className="size-4" /></span>{profile?.campus ? `For ${profile.campus}` : "Student-to-student, always"}</div></div>
        <div className="mt-7 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Filter by category">{CATEGORIES.map((item) => { const Icon = item.icon; const active = category === item.id; return <button type="button" role="tab" aria-selected={active} key={item.id} onClick={() => setCategory(item.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 border px-3.5 text-sm font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}><Icon className="size-4" />{item.label}</button>; })}</div>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto]"><label className="relative block"><span className="sr-only">Search campus listings</span><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try ‘biology textbook’ or ‘desk lamp’" className="h-11 rounded-sm border-border bg-background pl-10" /></label><div className="flex items-center gap-1 border border-border bg-background p-1" aria-label="Listing type filter">{(["all", "swap", "rent", "sell"] as const).map((value) => <button type="button" key={value} onClick={() => setMode(value)} aria-pressed={mode === value} className={`min-h-8 px-3 text-xs font-semibold transition-colors ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{value === "all" ? "Everything" : value === "swap" ? "Swap" : value === "rent" ? "Rent" : "Buy"}</button>)}</div><label className="relative flex h-11 items-center gap-2 border border-border bg-background px-3 text-sm"><ListFilter className="size-4 text-muted-foreground" /><span className="sr-only">Sort listings</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-full min-w-24 appearance-none bg-transparent pr-5 text-sm font-medium outline-none"><option value="recent">Most recent</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" /></label></div>
        <div className="mt-7 flex items-center justify-between gap-3 border-b border-border pb-3"><p className="text-sm font-semibold">{surface === "requests" ? "Your exchange requests" : surface === "my-stuff" ? "Your listings" : "Fresh around campus"}<span className="ml-2 font-normal text-muted-foreground">{surface === "requests" ? incomingOrders.length + outgoingOrders.length : visibleItems.length} {surface === "requests" ? "requests" : "items"}</span></p><button type="button" onClick={() => { setCategory("all"); setMode("all"); setSearch(""); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><SlidersHorizontal className="size-3.5" /> Clear filters</button></div>
        {surface === "requests" ? <RequestBoard orders={[...incomingOrders, ...outgoingOrders.filter((order) => !incomingOrders.some((incoming) => incoming.id === order.id))]} listings={items} profiles={profiles} currentUserId={user?.id ?? ""} onStatus={handleOrderStatus} busy={pending} onFindItems={() => currentNav("listings")} /> : loading ? <div className="grid min-h-64 place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Gathering the latest listings…</span></div> : visibleItems.length ? <div className="market-grid mt-4">{visibleItems.map((item) => <ListingCard key={item.id} item={item} owner={item.profiles ?? profiles[item.owner_id]} isMine={item.owner_id === user?.id} onChoose={() => { setDays(3); setOfferId(""); setSelected(item); }} onDelete={() => void removeListing(item.id)} />)}</div> : <div className="mt-4 grid min-h-64 place-items-center border border-dashed border-border bg-muted/30 px-5 text-center"><div className="max-w-sm"><span className="mx-auto grid size-12 place-items-center bg-secondary text-primary"><Search className="size-5" /></span><h3 className="display-type mt-4 text-xl font-bold tracking-normal">Nothing on this shelf just yet.</h3><p className="mt-1 text-sm text-muted-foreground">Try another search, or be the first to add something your campus could use.</p><Button variant="outline" className="mt-4" onClick={askToList}><Plus className="size-4" /> Add a listing</Button></div></div>}
      </section>

      <footer className="border-t border-border bg-primary text-primary-foreground"><div className="page-container grid gap-8 py-8 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="display-type flex items-center gap-2 text-xl font-extrabold tracking-normal"><ArrowDownUp className="size-5" /> lendloom.</div><p className="mt-1 max-w-lg text-sm text-primary-foreground/75">The campus exchange board for things worth passing on.</p></div><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><button type="button" onClick={() => openAuth("signup")} className="inline-flex items-center gap-2 hover:underline"><GraduationCap className="size-4" /> Join your campus</button><button type="button" onClick={() => toast.message("Message your exchange partner to arrange a campus handoff.")} className="inline-flex items-center gap-2 hover:underline"><ShieldCheck className="size-4" /> How exchanges work</button></div></div><div className="border-t border-primary-foreground/15"><div className="page-container flex flex-wrap justify-between gap-2 py-3 text-xs text-primary-foreground/70"><span>© 2026 Lendloom · Made for the next student who needs it.</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Be kind. Meet somewhere public.</span></div></div></footer>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}><DialogContent className="max-h-[92dvh] overflow-y-auto rounded-sm sm:max-w-md"><DialogHeader className="text-left"><div className="mb-2 grid size-10 place-items-center bg-secondary text-primary"><GraduationCap className="size-5" /></div><DialogTitle className="display-type text-2xl font-extrabold tracking-normal">{authMode === "signup" ? "Your campus, a little closer." : "Welcome back to Lendloom."}</DialogTitle><DialogDescription>{authMode === "signup" ? "Create your student profile to start swapping, borrowing, and passing things on." : "Sign in to check your requests and keep your exchanges moving."}</DialogDescription></DialogHeader>
        {confirmationMessage ? <div role="status" className="border border-primary/15 bg-secondary p-4 text-sm leading-6"><p className="font-bold text-primary">One last step</p><p className="mt-1 text-muted-foreground">{confirmationMessage}</p></div> : <><div className="mt-1 grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={pending} onClick={() => void signInWithProvider("google")} className="h-11 rounded-sm border-border bg-background text-foreground hover:bg-muted"><GoogleMark /> Continue with Google</Button><Button variant="outline" disabled={pending} onClick={() => void signInWithProvider("lovable")} className="h-11 rounded-sm border-border bg-background text-foreground hover:bg-muted"><LovableMark className="size-[18px]" /> Continue with Lovable</Button></div><div className="relative my-1 text-center text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><span className="bg-background px-3">or use your email</span><span className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" /></div>
          <form onSubmit={(event) => void submitAuth(event)} className="grid gap-3">{authMode === "signup" && <><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="signup-name">Your name</Label><Input id="signup-name" autoComplete="name" required maxLength={60} value={authValues.name} onChange={(event) => setAuthValues({ ...authValues, name: event.target.value })} className="rounded-sm" /></div><div className="grid gap-1.5"><Label htmlFor="signup-campus">College / campus</Label><Input id="signup-campus" autoComplete="organization" required maxLength={100} value={authValues.campus} onChange={(event) => setAuthValues({ ...authValues, campus: event.target.value })} className="rounded-sm" /></div></div><div className="grid gap-1.5"><Label htmlFor="signup-hostel">Hostel or area <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="signup-hostel" maxLength={100} value={authValues.hostel} onChange={(event) => setAuthValues({ ...authValues, hostel: event.target.value })} className="rounded-sm" placeholder="North hostel, Block C…" /></div></>}
            <div className="grid gap-1.5"><Label htmlFor="auth-email">College email</Label><Input id="auth-email" type="email" autoComplete="email" required value={authValues.email} onChange={(event) => setAuthValues({ ...authValues, email: event.target.value })} className="rounded-sm" placeholder="you@college.edu" /></div><div className="grid gap-1.5"><Label htmlFor="auth-password">Password</Label><Input id="auth-password" type="password" minLength={6} autoComplete={authMode === "signup" ? "new-password" : "current-password"} required value={authValues.password} onChange={(event) => setAuthValues({ ...authValues, password: event.target.value })} className="rounded-sm" placeholder="At least 6 characters" /></div>{authError && <p role="alert" className="text-sm text-destructive">{authError}</p>}<Button type="submit" variant="primary" disabled={pending} className="mt-1 h-11 w-full rounded-sm">{pending ? <LoaderCircle className="size-4 animate-spin" /> : authMode === "signup" ? "Create my student profile" : "Log in to Lendloom"}<ArrowRight className="size-4" /></Button>
          </form><p className="text-center text-sm text-muted-foreground">{authMode === "signup" ? "Already part of Lendloom?" : "New to your campus board?"} <button type="button" className="font-bold text-primary hover:underline" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthError(""); setConfirmationMessage(""); }}>{authMode === "signup" ? "Log in" : "Create an account"}</button></p></>}</DialogContent></Dialog>

      <Dialog open={listOpen} onOpenChange={setListOpen}><DialogContent className="max-h-[92dvh] overflow-y-auto rounded-sm sm:max-w-xl"><DialogHeader className="text-left"><DialogTitle className="display-type text-2xl font-extrabold tracking-normal">Put a good thing back in play.</DialogTitle><DialogDescription>Keep it useful. List it for students nearby.</DialogDescription></DialogHeader><form onSubmit={(event) => void submitListing(event)} className="grid gap-4"><div className="grid gap-1.5"><Label htmlFor="item-title">What are you sharing?</Label><Input id="item-title" required maxLength={100} value={listValues.title} onChange={(event) => setListValues({ ...listValues, title: event.target.value })} className="rounded-sm" placeholder="e.g. First-year biology textbook" /></div><div className="grid gap-1.5"><Label htmlFor="item-description">A few details</Label><textarea id="item-description" rows={3} maxLength={500} value={listValues.description} onChange={(event) => setListValues({ ...listValues, description: event.target.value })} className="w-full resize-y border border-input bg-background px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2" placeholder="Condition, useful details, and where to pick up." /></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="item-category">Category</Label><select id="item-category" value={listValues.category} onChange={(event) => setListValues({ ...listValues, category: event.target.value as Category })} className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{CATEGORIES.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><div className="grid gap-1.5"><Label htmlFor="item-condition">Condition</Label><select id="item-condition" value={listValues.condition} onChange={(event) => setListValues({ ...listValues, condition: event.target.value })} className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="new">New</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair, but works</option></select></div></div><fieldset><legend className="mb-2 text-sm font-semibold">How would you like to pass it on?</legend><div className="grid grid-cols-3 gap-2">{(["swap", "rent", "sell"] as const).map((value) => <button type="button" key={value} onClick={() => setListValues({ ...listValues, mode: value })} aria-pressed={listValues.mode === value} className={`min-h-10 border px-2 text-sm font-semibold capitalize transition-colors ${listValues.mode === value ? "border-primary bg-secondary text-primary" : "border-border hover:bg-muted"}`}>{value === "swap" ? "Swap" : value === "rent" ? "Rent" : "Sell"}</button>)}</div></fieldset>{listValues.mode === "swap" ? <div className="grid gap-1.5"><Label htmlFor="item-wanted">What would you trade for?</Label><Input id="item-wanted" required maxLength={160} value={listValues.wanted} onChange={(event) => setListValues({ ...listValues, wanted: event.target.value })} className="rounded-sm" placeholder="Open to another textbook or a desk lamp" /></div> : <div className="grid gap-1.5"><Label htmlFor="item-price">{listValues.mode === "rent" ? "Rent per day (₹)" : "Asking price (₹)"}</Label><Input id="item-price" type="number" min="1" step="1" required value={listValues.price} onChange={(event) => setListValues({ ...listValues, price: event.target.value })} className="rounded-sm" placeholder="250" /></div>}<div className="grid gap-1.5"><Label htmlFor="item-photo">Add a photo <span className="font-normal text-muted-foreground">(JPG, PNG, WebP · up to 3 MB)</span></Label><Input id="item-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setPhoto(file); setPreview(file ? URL.createObjectURL(file) : ""); }} className="h-auto rounded-sm py-2 file:mr-3 file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary" />{preview && <img src={preview} alt="Selected listing photo" className="mt-1 aspect-[16/7] max-h-40 w-full object-cover" />}</div><div className="border-l-2 border-primary bg-secondary/60 px-3 py-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline size-3.5 text-primary" /> Meet in a public campus spot and agree on the handoff before exchanging.</div><DialogFooter><Button type="button" variant="outline" onClick={() => setListOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Publish listing</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>{selected && <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-sm sm:max-w-lg"><DialogHeader className="text-left"><div className={`mb-2 grid size-11 place-items-center ${CATEGORY_TINT[selected.category]} text-foreground`}><CategoryIcon category={selected.category} /></div><DialogTitle className="display-type text-2xl font-extrabold tracking-normal">{selected.mode === "swap" ? "Make an exchange." : selected.mode === "rent" ? "Request a rental." : "Request this item."}</DialogTitle><DialogDescription>{selected.title} · {selected.mode === "swap" ? "Offer one of your own swap listings" : selected.mode === "rent" ? `Rent for ${formatPrice(selected.price)} per day` : formatPrice(selected.price)}</DialogDescription></DialogHeader><form onSubmit={(event) => void submitRequest(event)} className="grid gap-4">{selected.mode === "swap" ? <div className="grid gap-1.5"><Label htmlFor="swap-offer">Choose one of your available swap items</Label><select id="swap-offer" required value={offerId} onChange={(event) => setOfferId(event.target.value)} className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select an item to offer</option>{offerItems.map((item) => <option key={item.id} value={item.id}>{item.title} · looking for {item.wanted}</option>)}</select>{offerItems.length === 0 && <p className="text-xs text-muted-foreground">You’ll need an available swap listing first. Close this, then add one from “List an item”.</p>}</div> : selected.mode === "rent" ? <><div className="grid gap-1.5"><Label htmlFor="rental-days">Number of days</Label><Input id="rental-days" type="number" min="1" max="30" value={days} onChange={(event) => setDays(clampRentalDays(Number(event.target.value)))} className="rounded-sm" /><p className="text-xs text-muted-foreground">Rentals can be requested for 1–30 days.</p></div><div className="flex items-center justify-between border-y border-border py-3"><span className="text-sm text-muted-foreground">Estimated total</span><span className="display-type text-xl font-extrabold">{formatPrice(rentalTotal(selected.price, days))}</span></div></> : <div className="flex items-center justify-between border-y border-border py-3"><span className="text-sm text-muted-foreground">Asking price</span><span className="display-type text-xl font-extrabold">{formatPrice(selected.price)}</span></div>}<p className="text-sm leading-6 text-muted-foreground">The student who listed it will see your request and can respond. Arrange a safe campus handoff together.</p><DialogFooter><Button type="button" variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || (selected.mode === "swap" && !offerItems.length)}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{selected.mode === "swap" ? "Send swap offer" : selected.mode === "rent" ? "Request rental" : "Request to buy"}</Button></DialogFooter></form></DialogContent>}</Dialog>
    </main>
  );
}

function CategoryIcon({ category }: { category: Category }) {
  const Icon = CATEGORIES.find((item) => item.id === category)?.icon ?? PackageCheck;
  return <Icon className="size-5" />;
}

function ListingCard({ item, owner, isMine, onChoose, onDelete }: { item: Listing; owner?: Profile | null | undefined; isMine: boolean; onChoose: () => void; onDelete: () => void }) {
  const priceLabel = item.mode === "swap" ? "Swap" : item.mode === "rent" ? `${formatPrice(item.price)} / day` : formatPrice(item.price);
  return <article className="group flex min-w-0 flex-col border border-border bg-card transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 soft-shadow hover:editorial-shadow"><div className={`listing-photo relative grid place-items-center overflow-hidden ${CATEGORY_TINT[item.category]}`}>{item.photo_url ? <img src={item.photo_url} alt={item.title} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="relative flex flex-col items-center gap-2 text-primary"><CategoryIcon category={item.category} /><span className="text-[0.65rem] font-bold uppercase tracking-[0.1em]">{CATEGORIES.find((row) => row.id === item.category)?.label ?? "Campus find"}</span></div>}<span className="absolute left-3 top-3 inline-flex items-center gap-1.5 border border-border/60 bg-background/95 px-2.5 py-1 text-[0.68rem] font-bold capitalize"><span className={`size-1.5 rounded-full ${item.mode === "swap" ? "bg-coral" : item.mode === "rent" ? "bg-primary" : "bg-foreground"}`} />{item.mode === "sell" ? "For sale" : item.mode === "rent" ? "For rent" : "Swap wanted"}</span>{!isMine && <button type="button" aria-label={`Save ${item.title}`} onClick={() => toast.message("Save listings is coming soon.")} className="absolute right-3 top-3 grid size-8 place-items-center border border-border/60 bg-background/90 text-foreground hover:text-coral"><Heart className="size-4" /></button>}</div><div className="flex flex-1 flex-col p-4"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">{CATEGORIES.find((row) => row.id === item.category)?.label ?? "Other"} <span className="px-1 text-border">/</span> {item.condition.replace("_", " ")}</span><span className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] text-muted-foreground"><Clock3 className="size-3" /> {formatDate(item.created_at)}</span></div><h3 className="display-type line-clamp-2 min-h-12 text-base font-bold leading-6 tracking-normal">{item.title}</h3>{item.description && <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{item.description}</p>}{item.mode === "swap" && item.wanted && <p className="mt-2 border-l-2 border-coral pl-2 text-xs leading-5"><span className="font-semibold">Looking for:</span> <span className="text-muted-foreground">{item.wanted}</span></p>}<div className="mt-4 flex items-center gap-2 border-t border-border pt-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[0.63rem] font-bold text-primary">{initials(owner?.display_name ?? "Student")}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{owner?.display_name ?? "Campus student"}</span><span className="block truncate text-[0.66rem] text-muted-foreground">{owner?.hostel || owner?.campus || "Near your campus"}</span></span><strong className="shrink-0 text-sm font-extrabold text-primary">{priceLabel}</strong></div><div className="mt-3 grid grid-cols-[1fr_auto] gap-2">{isMine ? <><span className={`flex items-center gap-1.5 text-xs font-semibold ${item.status === "available" ? "text-primary" : "text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${item.status === "available" ? "bg-primary" : "bg-muted-foreground"}`} />{item.status === "available" ? "Live on campus" : item.status}</span><Button type="button" variant="ghost" size="sm" onClick={onDelete} className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive">Remove</Button></> : <Button type="button" variant="primary" size="sm" className="col-span-2 h-9 rounded-sm" onClick={onChoose}>{item.mode === "swap" ? <><ArrowDownUp className="size-3.5" /> Make an offer</> : item.mode === "rent" ? <><Clock3 className="size-3.5" /> Request to rent</> : <><ArrowRight className="size-3.5" /> Request to buy</>}</Button>}</div></div></article>;
}

function RequestBoard({ orders, listings, profiles, currentUserId, onStatus, busy, onFindItems }: { orders: Order[]; listings: Listing[]; profiles: Record<string, Profile>; currentUserId: string; onStatus: (order: Order, status: OrderStatus) => void; busy: boolean; onFindItems: () => void }) {
  if (!orders.length) return <div className="mt-4 grid min-h-64 place-items-center border border-dashed border-border px-5 text-center"><div className="max-w-sm"><span className="mx-auto grid size-12 place-items-center bg-secondary text-primary"><ArrowDownUp className="size-5" /></span><h3 className="display-type mt-4 text-xl font-bold tracking-normal">Nothing to answer yet.</h3><p className="mt-1 text-sm text-muted-foreground">When someone sends an offer, it’ll show up here. Your outgoing requests live here too.</p><Button variant="outline" className="mt-4" onClick={onFindItems}>Explore campus finds <ArrowRight className="size-4" /></Button></div></div>;
  return <div className="mt-4 grid gap-3">{orders.map((order) => {
    const item = listings.find((listing) => listing.id === order.item_id);
    const incoming = item?.owner_id === currentUserId;
    const offer = order.proposed_item_id ? listings.find((listing) => listing.id === order.proposed_item_id) : null;
    const person = profiles[incoming ? order.buyer_id : item?.owner_id ?? ""];
    const canRespond = incoming && order.status === "pending";
    const canReturn = order.kind === "rent" && order.status === "accepted";
    return <article key={order.id} className="grid gap-4 border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center bg-secondary text-primary">{order.kind === "swap" ? <ArrowDownUp className="size-5" /> : order.kind === "rent" ? <Clock3 className="size-5" /> : <Tag className="size-5" />}</span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">{incoming ? "Incoming request" : "Your request"} <span className="px-1 text-border">·</span> {order.status}</p><h3 className="display-type mt-1 truncate text-base font-bold tracking-normal">{item?.title ?? "Campus listing"}</h3><p className="mt-1 text-sm text-muted-foreground">{person?.display_name ?? "Campus student"}{order.kind === "swap" && offer ? ` offers “${offer.title}”` : order.kind === "rent" ? ` · ${order.days} ${order.days === 1 ? "day" : "days"} · ${formatPrice(order.total)}` : order.kind === "sell" ? ` · ${formatPrice(order.total)}` : ""}</p></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{canRespond ? <><Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus(order, "declined")}>Decline</Button><Button variant="primary" size="sm" disabled={busy} onClick={() => onStatus(order, "accepted")}><Check className="size-4" /> Accept</Button></> : canReturn ? <Button variant="outline" size="sm" disabled={busy} onClick={() => onStatus(order, "completed")}><PackageCheck className="size-4" /> Mark returned</Button> : <span className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${order.status === "accepted" || order.status === "completed" ? "border-primary/20 bg-secondary text-primary" : "border-border bg-muted text-muted-foreground"}`}>{order.status === "accepted" || order.status === "completed" ? <Check className="size-3.5" /> : <Clock3 className="size-3.5" />}{order.status}</span>}</div></article>;
  })}</div>;
}

function GoogleMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>;
}