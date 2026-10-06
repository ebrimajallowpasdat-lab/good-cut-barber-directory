# GoodCut

GoodCut is a small barber directory. It uses Node.js 24, serves the pages and JSON API from one process, and supports local SQLite or a PostgreSQL database such as Supabase.

## Run locally

1. Install Node.js 24 or newer.
2. Run `npm start` in this folder.
3. Open `http://localhost:3000`.

Without `DATABASE_URL`, SQLite data is stored in `data/goodcut.sqlite`. Set `DATABASE_URL` to use PostgreSQL in production. The directory starts empty and lists only approved barber profiles with contact numbers. Back up the local SQLite file to preserve local data.

## Barber listings and review

The signup form requires the barber's contact phone number and allows an optional JPEG, PNG, or WebP profile photo up to 2 MB. Uploaded images are checked by the server, renamed, and stored in `uploads/`. Profiles without a photo use the GoodCut logo. New listings remain private with `pending` status until approved. Customers can open a listed number in their phone app or contact the barber through WhatsApp.

The `Contact.html` page accepts private developer feedback. Submissions are stored in SQLite locally or PostgreSQL when `DATABASE_URL` is configured, and can be read, marked reviewed, or reopened from the admin-only Developer feedback section at `/review.html`. The optional email address is shown only in that admin queue; the form does not send email automatically.

Set `ADMIN_API_TOKEN` in the ignored `.env` file to a random secret of at least 32 characters. In PowerShell, generate a value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and save it as `ADMIN_API_TOKEN`; run it again for `RATE_LIMIT_SECRET`. Restart the server and open `/review.html`; paste the same admin token to unlock the queue. The page keeps it in memory only and clears it when locked. Phone numbers are public contact details and are not verified by GoodCut.

The review API is also available directly: `GET /api/admin/barbers/pending`, then `POST /api/admin/barbers/{id}/decision` with `{"status":"approved"}` or `{"status":"rejected"}`, using `Authorization: Bearer <token>`.

## Donations

Copy `.env.example` to `.env` if you do not already have a local `.env`, then set `WAVE_GAMBIA_ACCOUNT_NAME` and `WAVE_GAMBIA_PHONE` to the Wave recipient donors should use. The local Wave flow is a manual transfer: the donor sends money in Wave, submits the transaction ID, and the claim stays out of the total until you check the receipt and confirm it at `/review.html`.

International card checkout uses Stripe in USD. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `PUBLIC_URL` in `.env`; configure the Stripe webhook endpoint as `https://your-domain/api/webhooks/stripe`. The Stripe merchant account must be registered in a Stripe-supported business country. The Gambia is not currently on Stripe's supported merchant-country list. Successful card totals are updated only from Stripe's signed webhook.

Never paste payment-provider secrets into chat or browser code. `.env` is ignored by Git; do not commit it.

## Free hosting (Render + Supabase)

`render.yaml` describes a free Render Node web service. Render assigns it an `onrender.com` subdomain after deployment. Render's free web service sleeps after inactivity and its local filesystem is temporary, so do not use SQLite for hosted data.

To prepare a deploy:

1. Create a Supabase project on the free plan and copy its PostgreSQL **session pooler** connection string. Treat it as a password; do not put it in source code.
2. Create a private GitHub repository for this project and connect it to Render. Choose the repository's `render.yaml` blueprint.
3. In Render's environment settings, provide `DATABASE_URL` (Supabase connection string), `ADMIN_API_TOKEN`, and `RATE_LIMIT_SECRET`. The blueprint enables trusted proxy IP forwarding for rate limits. Generate the two secrets locally using the PowerShell command above; never send them in chat.
4. Wait for the Render deployment, open its assigned HTTPS subdomain, and test both `Contact.html` and `/review.html`.

The app creates its Postgres tables on first start. In Postgres mode, optional barber photos are stored as data URLs in the database, so they survive Render restarts along with profiles and feedback. Supabase's free project can pause after a week without activity; Render's free web service sleeps after 15 minutes without traffic. These plans are suitable for a low-traffic trial, not an uptime guarantee. A custom `.com` domain is not included; the free hosting subdomain is.

## API

- `GET /api/barbers` returns public barber profiles and their current rating summaries.
- `POST /api/barbers` creates a private pending profile with a required contact phone and optional validated profile photo.
- `POST /api/feedback` submits private developer feedback with optional name/email and a required message.
- `GET /api/admin/feedback` and `POST /api/admin/feedback/{id}/decision` are protected by `ADMIN_API_TOKEN`; decisions use `{"status":"reviewed"}` or `{"status":"new"}`.
- `GET /api/admin/barbers/pending` and `POST /api/admin/barbers/{id}/decision` are protected by `ADMIN_API_TOKEN` for manual review.
- `GET /api/reviews?barberId=1` returns reviews for a barber.
- `POST /api/reviews` adds a review with `barberId`, `rating` (1–5), and optional `name` and `text`.
- `GET /api/payment-options` returns configured public payment methods and Wave recipient details.
- `POST /api/donations/wave` creates a pending local Wave transfer; `POST /api/donations/wave/confirm` submits its Wave transaction ID for manual review.
- `POST /api/donations/stripe` initializes USD Stripe Checkout; a signed webhook confirms successful payment.
- `GET /api/admin/donations/pending` and `POST /api/admin/donations/{id}/decision` let an authorized admin review Wave transfer claims.
- `GET /api/donations/summary` returns totals for confirmed GMD and USD donations only.
- `POST /api/webhooks/stripe` accepts signed Stripe Checkout completion webhooks.

Requests and responses use JSON. The app includes basic input validation, limits request bodies, and uses parameterized SQL.

## Before public launch

This starter runs as one local Node process. A domain alone does not host a database or backend; deploy the Node server to a host that supports Node.js 24, persist the SQLite `data` and `uploads` directories (or move to managed storage for multi-instance hosting), and configure HTTPS. Public launch also needs barber account authentication and ownership controls, abuse reporting, privacy/retention choices, backups, and production monitoring. Rate limiting and manual review reduce abuse but do not independently verify a barber's identity or business.
