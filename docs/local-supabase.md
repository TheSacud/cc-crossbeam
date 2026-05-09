# Local Supabase Setup

Use this when the hosted Supabase project is paused or when running CrossBeam on a VPS.

## 1. Install prerequisites

- Docker Desktop locally, or Docker Engine on the VPS.
- Supabase CLI.

On Windows, the simplest install is usually:

```powershell
npm install -g supabase
```

## 2. Start Supabase

From the repo root:

```powershell
supabase start
supabase db reset
supabase status -o env
```

`supabase db reset` applies `supabase/migrations/*`, including the CrossBeam schema, RLS policies, Realtime tables, and storage buckets.

## 3. Configure env files

Copy:

```powershell
Copy-Item frontend/.env.local.example frontend/.env.local
Copy-Item server/.env.example server/.env
```

Then paste the local values printed by:

```powershell
supabase status -o env
```

Use:

- `SUPABASE_URL` for `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`.
- `SUPABASE_ANON_KEY` for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` for both frontend and server service-role vars.

Keep:

- `CLOUD_RUN_URL=http://localhost:3001`
- `PORT=3001`

The Anthropic and Vercel values are still required for real agent runs.

## 4. Verify setup

```powershell
node scripts/check-supabase-setup.mjs
```

Expected checks:

- `projects`, `files`, `messages`, `outputs`, `applicant_answers`
- `crossbeam-uploads`, `crossbeam-outputs`, `crossbeam-demo-assets`

## 5. Run locally

Terminal 1:

```powershell
cd server
npm run build
npm run dev
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## VPS notes

For DuckDNS later, keep Supabase bound to localhost/private Docker networking and expose only the frontend/backend through a reverse proxy. Do not expose the Supabase service-role key or Postgres port publicly.
