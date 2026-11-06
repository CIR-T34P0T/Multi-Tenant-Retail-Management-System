# Self-hosted deployment guide

> Status: written in Stage 2, **not yet tested on a real server**. Stage 15 performs and verifies the full production deployment, backups and a restore drill.

## What runs on the server

| Part                                                      | How it runs                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Supabase (PostgreSQL, Auth, Storage, API gateway, Studio) | Official Supabase Docker stack, in its own folder                     |
| RBMS app (Next.js)                                        | `deploy/docker-compose.yml` → `app` service                           |
| HTTPS                                                     | `deploy/docker-compose.yml` → `caddy` service, automatic certificates |

You need: a Linux VPS (proposed start: 2 vCPU, 4 GB RAM, 80 GB SSD), two DNS names pointing at it (e.g. `app.yourdomain.com` and `api.yourdomain.com`), and an SMTP account for sign-up and password-reset emails.

## 1. Prepare the server

1. Create a non-root user with sudo; log in with an SSH key; disable password and root SSH login.
2. Turn on automatic security updates.
3. Firewall: allow only 22 (SSH), 80 and 443.
4. Install Docker Engine and the Compose plugin (Docker's official instructions for your Linux distribution).

## 2. Run Supabase

1. Download the official self-hosted setup:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   mkdir -p ~/supabase && cp -r supabase/docker/* supabase/docker/.env.example ~/supabase/
   cd ~/supabase && cp .env.example .env
   ```
2. **Replace every example secret in `.env`** before the first start: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` (generated from your `JWT_SECRET` — follow Supabase's self-hosting guide), `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`, and any other key marked as a secret.
3. Set the public URLs: `API_EXTERNAL_URL=https://api.yourdomain.com`, `SUPABASE_PUBLIC_URL=https://api.yourdomain.com`, `SITE_URL=https://app.yourdomain.com`.
4. Configure SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`).
   Sign-in settings to check in the same `.env`:
   - **Email confirmation on** (`ENABLE_EMAIL_AUTOCONFIRM=false`): people must confirm their email before signing in. Invitations rely on confirmed emails.
   - `ADDITIONAL_REDIRECT_URLS=https://app.yourdomain.com/**` so password-reset and confirmation links may return to the app.
   - Minimum password length 10 (`GOTRUE_PASSWORD_MIN_LENGTH=10` on the auth service), matching the app's rule.
     The default Supabase email templates work with the app's `/auth/confirm` page; no template changes are needed.
5. Copy `deploy/supabase/docker-compose.override.yml` from this repository into `~/supabase/`. It keeps the database and gateway ports on `127.0.0.1` (Docker ports otherwise bypass the firewall). Check the service names with `docker compose config --services`.
6. `chmod 600 .env && docker compose up -d`, then `docker compose ps` — all services should be healthy.
7. Studio (database admin) is **not** public. Open it from your computer with an SSH tunnel:
   `ssh -L 8000:127.0.0.1:8000 you@server`, then visit `http://localhost:8000`.

## 3. Run the app

```bash
git clone <your repository> ~/rbms && cd ~/rbms/deploy
cp app.env.example app.env && chmod 600 app.env   # fill in domains and keys from step 2
docker compose --env-file app.env up -d --build
```

Caddy obtains certificates automatically once DNS points to the server. Visit `https://app.yourdomain.com`.

## 4. Database migrations

From your computer (or CI), with the Supabase CLI linked to the server database through an SSH tunnel to port 5432:

```bash
npx supabase db push --db-url "postgresql://postgres:<password>@127.0.0.1:5432/postgres"
```

## 5. Backups (finalised in Stage 15)

Plan (docs/04 §16): continuous WAL archiving plus a nightly base backup to off-site object storage (pgBackRest or WAL-G), a copy of Storage files, 30-day retention, and a restore drill before go-live. **Until Stage 15 is complete, do not hold real business data on the server.**

## 6. Updating

```bash
cd ~/rbms && git pull && cd deploy && docker compose --env-file app.env up -d --build
```

Apply new database migrations (step 4) **before** deploying an app version that needs them.
