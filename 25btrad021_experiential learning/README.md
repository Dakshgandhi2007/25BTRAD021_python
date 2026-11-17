# Lendloom — Campus Exchange

The Lendloom student marketplace source code, including the website, interface assets, tests, and database migration history.

## Included

- Marketplace screens for swaps, rentals, sales, student profiles, and exchange requests
- Styling, icons, and the campus exchange photograph
- Database migration SQL covering marketplace records and access protections
- Automated tests and the Vite/TanStack project configuration

## Run locally

Requirements: Bun and a Lovable Cloud project with the matching marketplace schema and storage bucket.

1. Install dependencies: `bun install`
2. Create a local `.env` file from `.env.example` and enter the public project URL and publishable key from your own Lovable Cloud setup.
3. Start the development server: `bun run dev`
4. Run checks: `bun test`

The browser app expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The `.env.example` contains blank placeholders only. Never put a service-role key or other private credential in browser variables.

The migration files are included as source/reference. They do not copy student accounts, listings, requests, or uploaded photos, and this archive does not automatically create or connect a database. Existing data must be exported and imported separately. Passwords and login sessions are not included.

## Privacy

This download intentionally excludes private environment files, access tokens, repository history, installed dependencies, and generated build output.
