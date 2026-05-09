# CrossBeam VPS Deploy

This deploy layout exposes only the Next.js frontend publicly. The Express worker must stay bound to `127.0.0.1:3001`.

## 1. Environment

Copy and fill:

```bash
cp deploy/env/server.env.example server/.env
cp deploy/env/frontend.env.example frontend/.env.local
chmod 600 server/.env frontend/.env.local
```

Use the same Supabase service-role key in both files. `CROSSBEAM_API_KEY` must be a long random secret.

For public deploy, prefer hosted Supabase or a hardened self-hosted Supabase with unique production JWT/API secrets. The Supabase CLI local stack is useful for testing, but it uses development defaults and should not be exposed directly to the internet.

Important: `NEXT_PUBLIC_*` values are baked into the Next.js build, so rebuild the frontend after changing `frontend/.env.local`.

## 2. Docker Compose Build

```bash
cd /home/da/cc-crossbeam
cp deploy/env/compose.env.example .env
docker compose build
docker compose up -d
```

## 3. Optional systemd

The app services normally run through Docker Compose. The systemd units are kept for non-Docker deploys and for the Docker published-port guard when local Supabase CLI is used.

Verify:

```bash
curl http://127.0.0.1:3001/health
curl -I http://127.0.0.1:3000
systemctl status crossbeam-server --no-pager
systemctl status crossbeam-frontend --no-pager
```

## 4. Nginx and DuckDNS

Replace `DUCKDNS_DOMAIN` with the DuckDNS hostname:

```bash
sudo sed 's/DUCKDNS_DOMAIN/your-name.duckdns.org/g' \
  deploy/nginx/crossbeam.conf.template | sudo tee /etc/nginx/sites-available/crossbeam
sudo ln -s /etc/nginx/sites-available/crossbeam /etc/nginx/sites-enabled/crossbeam
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-name.duckdns.org
```

Only ports `80`, `443`, and SSH should be public. If local Supabase CLI is running, keep `crossbeam-docker-firewall` enabled because it publishes local services on Docker ports `54321-54329`.
