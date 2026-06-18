# Deploy on Hostinger (Business plan) with MySQL / phpMyAdmin

The app is already MySQL-ready — it auto-creates every table on first run. You
do **not** need to write any SQL by hand. Just create a database, set the env
vars, build, and seed an admin.

## 1. Create the MySQL database
hPanel → **Databases → MySQL Databases**
- Create a new database + user (Hostinger prefixes them, e.g. `u123456789_celestile`).
- Give the user **All Privileges** on that database.
- Note: **DB name**, **DB user**, **password**. Host is **`localhost`** (the app
  runs on the same server). You can browse it anytime via **phpMyAdmin**.

## 2. Set environment variables (Node.js app)
hPanel → **Advanced → Node.js** → your app → **Environment variables**
(see `.env.example` for the full list):

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=u123456789_celestile
DB_PASSWORD=••••••••
DB_NAME=u123456789_celestile
NEXTAUTH_SECRET=<long random string>     # openssl rand -base64 32
NEXTAUTH_URL=https://yourdomain.com
DEVELOPER_SECRET=<your secret>
MAYTAPI_PRODUCT_ID=...                    # optional (WhatsApp)
MAYTAPI_PHONE_ID=...
MAYTAPI_TOKEN=...
```

> ❗ Do **NOT** set `SHEETS_DB_ID`, and don't upload `credentials.json` — leaving
> them out keeps the app on MySQL. (Both present = Google Sheets mode.)

## 3. Install + build
In the Node.js app panel (or via SSH in the app folder):
```
npm install
npm run build
```
Set the app **startup file** to `server.js` (already in the repo) and **restart**.

## 4. Create the tables + first admin
Tables auto-create on the first request. Then bootstrap a login — pick one:

**Option A — one-click admin (no SSH):** open in a browser
```
https://yourdomain.com/api/init-admin?secret=<DEVELOPER_SECRET>
```
→ creates **admin@celestile.com** / **Celestile@123** (Admin). Log in, then add
real users from the **Users** page and change this password.

**Option B — seed all users from the bundled data (SSH):**
```
node scripts/migrate.mjs
```
→ imports the 33 users (+ any seed data) from `data/store.json`. Those users log
in with the default password **India@123** until changed (Users page → Set Password).

## 5. Log in
Open `https://yourdomain.com`, sign in with the admin above.

## Notes
- View / edit data anytime in **phpMyAdmin** (hPanel → Databases → phpMyAdmin).
- Schema changes ship automatically: `CREATE TABLE IF NOT EXISTS` +
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS` run on startup (MariaDB supports these).
- Images (slab photos, delegation/quotation photos) are stored as small
  compressed data-URIs in `MEDIUMTEXT`/`LONGTEXT` columns — no file storage needed.
- WhatsApp works the same (Maytapi) once the `MAYTAPI_*` vars are set.
