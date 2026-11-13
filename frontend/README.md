# Our Roots

A family-tree app. The public site is a React app in this folder. Accounts, families, and share links are stored in PostgreSQL by the Node.js API in `../backend`.

## Run

Start Postgres (from the repo root):

```bash
docker compose up -d
```

Then:

```bash
npm install
npm install --prefix ../backend
npm run dev
```

Open http://localhost:5173/roots/

The dev command starts the API on port 3001 and the site on port 5173. The site proxies `/roots/api` to the API.

## Sign in

Log in and Sign up both use Google. Set these in `../backend/.env` or in `.env` here:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=http://localhost:5173/roots/api/auth/google/callback`
- `APP_PUBLIC_URL=http://localhost:5173/roots`
- `SESSION_SECRET`

In Google Cloud, create an OAuth client and add that callback URL as an authorized redirect URI.

Each account can create 10 families. That number is the `max_families_per_user` row in the `app_settings` table:

```sql
UPDATE app_settings SET value = '10' WHERE key = 'max_families_per_user';
```

On a family, Generate link creates a public address at `/share/<token>`. Opening it does not require a login.

## Existing trees

JSON files in `public/families` are imported once into public trees, so addresses such as `/tree/sharma` keep working. Set `ADMIN_EMAIL` to a Google account email to edit those public trees. They do not count toward the 10-family limit. Families created after sign-in are private until a share link is generated.

## Production

```bash
npm run build
npm start
```

`npm start` serves the built site on port 8501 and mounts the API from `../backend`. Set `APP_PUBLIC_URL` and `GOOGLE_CALLBACK_URL` to that public origin, for example `http://localhost:8501/roots` and `http://localhost:8501/roots/api/auth/google/callback`.
