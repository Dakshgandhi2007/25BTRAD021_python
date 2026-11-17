import os, re, secrets, functools
from datetime import datetime, timedelta, timezone

import bcrypt, jwt, psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, make_response, g

load_dotenv()
BASE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(BASE, "public")
SECRET = os.environ.get("JWT_SECRET", "dev-secret")
CATS = ["clothes", "shoes", "accessories", "jewellery"]
MODES = ["rent", "sell"]
IMG_TYPES = ["image/jpeg", "image/png", "image/webp"]
MAX_IMG = 3 * 1024 * 1024

app = Flask(__name__, static_folder=PUB, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_IMG + 512 * 1024  # room for form fields


def err(msg, code=400):
    return jsonify(error=msg), code


def db():
    """One short-lived connection per request (fine for serverless + Neon)."""
    if "db" not in g:
        g.db = psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=RealDictCursor)
    return g.db


def q(sql, params=(), one=False, fetch=True):
    with db().cursor() as cur:
        cur.execute(sql, params)
        out = (cur.fetchone() if one else cur.fetchall()) if fetch else None
    db().commit()
    return out


@app.teardown_appcontext
def close_db(_):
    c = g.pop("db", None)
    if c:
        c.close()


# ---------- schema + seed (once per server start) ----------
_ready = False


def init():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=RealDictCursor)
    try:
        with conn.cursor() as c:
            c.execute("""
            CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
            CREATE TABLE IF NOT EXISTS items(id SERIAL PRIMARY KEY, owner_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT NOT NULL, mode TEXT NOT NULL, price NUMERIC(10,2) NOT NULL, status TEXT DEFAULT 'available', created_at TIMESTAMPTZ DEFAULT now());
            CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, item_id INT REFERENCES items(id) ON DELETE CASCADE, buyer_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT, days INT, total NUMERIC(10,2), created_at TIMESTAMPTZ DEFAULT now());
            ALTER TABLE items ADD COLUMN IF NOT EXISTS image BYTEA; ALTER TABLE items ADD COLUMN IF NOT EXISTS image_type TEXT;""")
            c.execute("SELECT 1 FROM items LIMIT 1")
            if not c.fetchone():
                h = bcrypt.hashpw(secrets.token_hex(8).encode(), bcrypt.gensalt(10)).decode()
                c.execute("INSERT INTO users(name,email,password_hash) VALUES('Lendloom Team','team@lendloom.local',%s) "
                          "ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id", (h,))
                uid = c.fetchone()["id"]
                seed = [("Emerald silk saree", "Festival-ready, dry cleaned", "clothes", "rent", 799),
                        ("Navy bandhgala blazer", "Size 40, worn twice", "clothes", "rent", 599),
                        ("White leather sneakers", "UK 8, barely used", "shoes", "sell", 2499),
                        ("Block heel sandals", "UK 5, great for weddings", "shoes", "rent", 349),
                        ("Tan crossbody bag", "Fits a phone and a water bottle", "accessories", "sell", 1799),
                        ("Retro aviator sunglasses", "Polarised lenses", "accessories", "rent", 149),
                        ("Kundan choker set", "With matching earrings", "jewellery", "rent", 899),
                        ("Silver moon pendant", "925 silver, 18 inch chain", "jewellery", "sell", 1299)]
                for r in seed:
                    c.execute("INSERT INTO items(owner_id,title,description,category,mode,price) VALUES(%s,%s,%s,%s,%s,%s)", (uid, *r))
        conn.commit()
    finally:
        conn.close()


@app.before_request
def ensure_ready():
    global _ready
    if request.path.startswith("/api") and not _ready:
        try:
            init()
            _ready = True
        except Exception as e:
            app.logger.error(e)
            return err("Database is not reachable. Check DATABASE_URL.", 500)


# ---------- auth ----------
def set_login(resp, u):
    tok = jwt.encode({"id": u["id"], "name": u["name"], "exp": datetime.now(timezone.utc) + timedelta(days=7)}, SECRET, algorithm="HS256")
    resp.set_cookie("t", tok, httponly=True, samesite="Lax", secure=bool(os.environ.get("VERCEL")), max_age=604800)
    return resp


def current_user():
    try:
        return jwt.decode(request.cookies.get("t", ""), SECRET, algorithms=["HS256"])
    except Exception:
        return None


def auth(f):
    @functools.wraps(f)
    def w(*a, **k):
        g.user = current_user()
        if not g.user:
            return err("Log in to continue", 401)
        return f(*a, **k)
    return w


@app.errorhandler(413)
def too_big(_):
    return err("Image must be under 3 MB")


@app.errorhandler(Exception)
def boom(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    app.logger.exception(e)
    return err("Something went wrong. Try again.", 500)


@app.post("/api/signup")
def signup():
    d = request.get_json(silent=True) or {}
    name, email, pw = (d.get("name") or "").strip(), d.get("email") or "", d.get("password") or ""
    if not name or not re.match(r"^\S+@\S+\.\S+$", email) or len(pw) < 6:
        return err("Enter a name, a valid email and a password of 6+ characters")
    h = bcrypt.hashpw(pw.encode(), bcrypt.gensalt(10)).decode()
    try:
        u = q("INSERT INTO users(name,email,password_hash) VALUES(%s,%s,%s) RETURNING id,name", (name, email.lower(), h), one=True)
    except psycopg2.errors.UniqueViolation:
        db().rollback()
        return err("That email already has an account", 409)
    return set_login(make_response(jsonify(user=u)), u)


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    u = q("SELECT * FROM users WHERE email=%s", ((d.get("email") or "").lower(),), one=True)
    ok = u and bcrypt.checkpw((d.get("password") or "").encode(), u["password_hash"].encode())
    if not ok:
        return err("Email or password is incorrect", 401)
    user = {"id": u["id"], "name": u["name"]}
    return set_login(make_response(jsonify(user=user)), user)


@app.post("/api/logout")
def logout():
    r = make_response(jsonify(ok=True))
    r.delete_cookie("t")
    return r


@app.get("/api/me")
def me():
    u = current_user()
    return jsonify(user={"id": u["id"], "name": u["name"]} if u else None)


# ---------- items ----------
@app.get("/api/items")
def items():
    category, mode, term = request.args.get("category"), request.args.get("mode"), request.args.get("q")
    w, p = ["i.status='available'"], []
    if category in CATS:
        p.append(category); w.append("i.category=%s")
    if mode in MODES:
        p.append(mode); w.append("i.mode=%s")
    if term:
        p += [f"%{term}%"] * 2; w.append("(i.title ILIKE %s OR i.description ILIKE %s)")
    rows = q("SELECT i.id,i.owner_id,i.title,i.description,i.category,i.mode,i.price,i.status,i.created_at,"
             "(i.image IS NOT NULL) has_image,u.name owner FROM items i JOIN users u ON u.id=i.owner_id "
             f"WHERE {' AND '.join(w)} ORDER BY i.created_at DESC LIMIT 60", p)
    return jsonify(rows)


@app.post("/api/items")
@auth
def add_item():
    f = request.form
    title, category, mode = (f.get("title") or "").strip(), f.get("category"), f.get("mode")
    try:
        price = float(f.get("price"))
    except (TypeError, ValueError):
        price = 0
    if not title or category not in CATS or mode not in MODES or not price > 0:
        return err("Add a title, category, rent or sell, and a price above 0")
    img, itype = None, None
    file = request.files.get("image")
    if file and file.mimetype in IMG_TYPES:  # silently ignore other types, like multer did
        img = file.read()
        if len(img) > MAX_IMG:
            return err("Image must be under 3 MB")
        itype = file.mimetype
    row = q("INSERT INTO items(owner_id,title,description,category,mode,price,image,image_type) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (g.user["id"], title, (f.get("description") or "").strip(), category, mode, price,
             psycopg2.Binary(img) if img else None, itype), one=True)
    return jsonify(row)


@app.get("/api/items/<int:iid>/image")
def item_image(iid):
    r = q("SELECT image,image_type FROM items WHERE id=%s", (iid,), one=True)
    if not r or not r["image"]:
        return "", 404
    resp = make_response(bytes(r["image"]))
    resp.headers["Content-Type"] = r["image_type"]
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.post("/api/items/<int:iid>/order")
@auth
def order(iid):
    it = q("SELECT * FROM items WHERE id=%s AND status='available'", (iid,), one=True)
    if not it:
        return err("This item is no longer available", 404)
    if it["owner_id"] == g.user["id"]:
        return err("You can't order your own item")
    days = 1
    if it["mode"] == "rent":
        try:
            days = int((request.get_json(silent=True) or {}).get("days"))
        except (TypeError, ValueError):
            days = 1
        days = min(max(days, 1), 30)
    total = it["price"] * days
    q("INSERT INTO orders(item_id,buyer_id,kind,days,total) VALUES(%s,%s,%s,%s,%s)", (it["id"], g.user["id"], it["mode"], days, total), fetch=False)
    if it["mode"] == "sell":
        q("UPDATE items SET status='sold' WHERE id=%s", (it["id"],), fetch=False)
    return jsonify(ok=True, total=float(total))


@app.delete("/api/items/<int:iid>")
@auth
def delete_item(iid):
    q("DELETE FROM items WHERE id=%s AND owner_id=%s", (iid, g.user["id"]), fetch=False)
    return jsonify(ok=True)


@app.get("/api/mine")
@auth
def mine():
    its = q("SELECT id,title,category,mode,price,status,(image IS NOT NULL) has_image FROM items WHERE owner_id=%s ORDER BY created_at DESC", (g.user["id"],))
    ords = q("SELECT o.*,i.title FROM orders o JOIN items i ON i.id=o.item_id WHERE o.buyer_id=%s ORDER BY o.created_at DESC", (g.user["id"],))
    return jsonify(items=its, orders=ords)


@app.get("/")
def index():
    return send_from_directory(PUB, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    init()
    _ready = True
    print(f"Lendloom running on http://localhost:{port}")
    app.run(port=port, debug=bool(os.environ.get("DEBUG")))
