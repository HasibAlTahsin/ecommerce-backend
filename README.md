# E-Commerce Ordering & Payment System

A production-grade, highly concurrent backend for an e-commerce platform. Built with Node.js, TypeScript, and Express, featuring a multi-provider payment architecture, atomic stock management, and robust webhook idempotency.

---

## Table of Contents
1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Installation and Local Setup](#installation-and-local-setup)
6. [Environment Variables](#environment-variables)
7. [API Documentation and Usage](#api-documentation-and-usage)
8. [Frontend (Vercel)](#frontend-vercel)
9. [Architecture and Design Decisions](#architecture-and-design-decisions)
10. [Testing Strategy](#testing-strategy)
11. [Known Constraints](#known-constraints)

---

## Overview
This project implements the core backend infrastructure for an e-commerce platform. It handles user authentication, product catalog management, complex order processing, and integrates multiple payment gateways (Stripe, bKash, Mock) using the Strategy Pattern. The system is specifically designed to handle race conditions during high-traffic checkouts and to guarantee exactly-once webhook processing.

---

## Key Features
- **Multi-Provider Payment Strategy:** Switch between Stripe, bKash, or a Mock provider without altering core checkout logic. `CheckoutService` contains zero provider-specific branching.
- **Concurrency-Safe Stock Management:** Prevents overselling using atomic conditional SQL updates and a database-level `CHECK` constraint.
- **Webhook Idempotency:** Guarantees that duplicate or out-of-order webhook deliveries do not cause double-charging or double stock reduction.
- **DFS Category Tree with Redis Caching:** Fetches category descendants via an iterative Depth-First Search, backed by Redis with a resilient database fallback and cycle protection.
- **Clean Layered Architecture:** A pure OOP domain layer (`Money`, `Order`, `Product`) with zero I/O dependencies, keeping business logic isolated and unit-testable.
- **Email Verification:** Registration sends a 6-digit PIN (via Nodemailer) that must be confirmed before login; unverified accounts are blocked. Uses Ethereal test SMTP in dev with zero credentials, real SMTP in production via env vars.
- **Security First:** Argon2id password hashing, JWT authentication, rate limiting on auth and global routes, non-root Docker containers, and Zod strict-input validation.
- **Checkout Frontend (Vercel):** A polished single-page frontend (`frontend/`) with Stripe Elements walks the full flow — auth + PIN verification, live catalogue, cart, checkout, and payment — deployed on Vercel.

---

## Tech Stack
- **Runtime and Language:** Node.js (v20), TypeScript
- **Web Framework:** Express.js
- **Database and ORM:** PostgreSQL, Prisma
- **Caching:** Redis (via ioredis)
- **Payment Gateways:** Stripe API, bKash Tokenized Checkout
- **API Docs:** Swagger UI (OpenAPI 3)
- **Testing:** Vitest, Supertest
- **Containerization:** Docker, Docker Compose

---

## Prerequisites
- Docker and Docker Compose
- Node.js (v20 or higher)
- npm (bundled with Node.js)

---

## Installation and Local Setup

**1. Clone the repository**
```bash
git clone https://github.com/HasibAlTahsin/ecommerce-backend.git
cd ecommerce-backend
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**
```bash
cp .env.example .env
```
Open `.env` and set `JWT_SECRET` to a random string of at least 32 characters. To exercise the real Stripe flow, set your Stripe **test** key in `STRIPE_SECRET_KEY`. The Mock provider works with no credentials at all, so the full order-to-payment flow is runnable out of the box.

**4. Start infrastructure (PostgreSQL and Redis)**
```bash
docker compose up -d
```
Verify with `docker ps`.

**5. Run database migrations**
```bash
npx prisma migrate deploy
```

**6. Seed the database**
Creates an admin, a customer, a 3-level category tree, and sample products.
```bash
npm run seed
```

**7. Start the server**
```bash
npm run dev
```
The API is available at `http://localhost:3000`, and interactive API docs at `http://localhost:3000/docs`.

---

## Environment Variables
The application validates its environment at boot using Zod. A missing required variable causes an immediate, explicit startup failure rather than a runtime error later.

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://app:app@localhost:5432/ecommerce` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) | `openssl rand -base64 48` |
| `STRIPE_ENABLED` | Toggle the Stripe provider | `true` |
| `STRIPE_SECRET_KEY` | Stripe test secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `MOCK_PAYMENTS_ENABLED` | Toggle the Mock provider | `true` |
| `BKASH_ENABLED` | Toggle the bKash provider | `false` |
| `CORS_ORIGINS` | Comma-separated frontend origins allowed by CORS (empty allows all in dev) | `https://your-app.vercel.app` |
| `SMTP_HOST` | SMTP host for verification email (unset uses Ethereal in dev) | `smtp.gmail.com` |

> Live keys must never be committed. `.env` is gitignored; `.env.example` documents the shape only.

---

## API Documentation and Usage

Interactive Swagger UI is available at `http://localhost:3000/docs` once the server is running.

**Seeded Credentials**
- Admin: `admin@example.com` / `Admin123!`
- Customer: `user@example.com` / `User123!`

### 1. Authentication
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"User123!"}'
```

> New registrations must be verified before login. Register, then confirm the 6-digit PIN (shown in the server log's Ethereal preview URL in dev) via `POST /api/auth/verify` with a body of email and pin. Seeded accounts are already verified.

### 2. Products
```bash
curl http://localhost:3000/api/products
```

### 3. Orders and Checkout
Create an order (replace `PRODUCT_PUBLIC_ID` and `YOUR_TOKEN`):
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"items":[{"productPublicId":"PRODUCT_PUBLIC_ID","quantity":2}]}'
```

Initiate checkout with the Mock provider (replace `ORDER_PUBLIC_ID`):
```bash
curl -X POST http://localhost:3000/api/orders/ORDER_PUBLIC_ID/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"provider":"MOCK"}'
```

### 4. Simulate a Mock Payment Webhook
Replace `TRANSACTION_ID` with the ID returned from checkout. The signature uses the same HMAC-SHA256 scheme the real Stripe verification path uses.
```bash
PAYLOAD='{"id":"evt_1","transactionId":"TRANSACTION_ID","status":"SUCCESS"}'
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "mock_webhook_secret" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhooks/mock \
  -H "Content-Type: application/json" \
  -H "x-mock-signature: $SIG" \
  -d "$PAYLOAD"
```

### 5. Testing Real Stripe Webhooks Locally
Stripe only delivers webhooks to a public HTTPS URL, so a local server needs a tunnel. Two approaches are supported.

**Option A — ngrok (public URL, works for any provider):**
```bash
ngrok http 3000
# Copy the HTTPS forwarding URL, e.g. https://xxxx.ngrok-free.dev
```
In the Stripe Dashboard, go to Event destinations and Add destination, set the URL to `https://xxxx.ngrok-free.dev/api/webhooks/stripe`, listening to `payment_intent.succeeded` and `payment_intent.payment_failed`. Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` in `.env` and restart the server. Inspect traffic at `http://127.0.0.1:4040`.

> ngrok's free tier issues a new URL on each restart — update the Stripe endpoint accordingly.

**Option B — Stripe CLI (no public URL needed):**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Prints its own whsec_... signing secret — put it in STRIPE_WEBHOOK_SECRET
```
Then trigger a test event in another terminal:
```bash
stripe trigger payment_intent.succeeded
```
The handler verifies the raw-body signature before any processing; an event whose `payment_intent` has no matching payment row is rejected, which is the correct behaviour.

---

## Frontend (Vercel)

A polished single-page checkout frontend lives in `frontend/index.html` (vanilla HTML/CSS/JS, Stripe Elements). It walks through the full flow: sign in / register + PIN verification, browse the live catalogue, cart, checkout, pay (Stripe Elements or Mock), and confirmation.

**Run locally:**
```bash
npx serve frontend
```
Open the printed URL. With the backend running on `http://localhost:3000`, sign in with the seeded customer (`user@example.com` / `User123!`) and the catalogue loads from the API.

**Configuration** — two globals at the bottom of `index.html`:
- `window.API_BASE` — backend base URL (defaults to `http://localhost:3000`; set to your ngrok HTTPS URL to reach a local backend from the deployed page).
- `window.STRIPE_PK` — your Stripe publishable test key (`pk_test_...`). Leave blank to use the Mock provider only. The publishable key is safe client-side by design; the secret key never leaves the server.

**Deployment:** deployed on Vercel with root directory `frontend` and framework preset "Other" (static, no build step). CORS on the backend is env-driven via `CORS_ORIGINS`; leave it empty in development to allow all origins, or set it to the deployed frontend origin in production.

---

## Architecture and Design Decisions

The codebase is organised in four layers with dependencies pointing inward only: the HTTP interface layer depends on the application layer, which depends on the domain layer; the infrastructure layer also depends inward on the domain. Nothing in `src/domain` imports anything with I/O.

### 1. Money as integer minor units
Floating-point math corrupts currency (`0.1 + 0.2 = 0.30000000000000004`). All monetary values are stored and computed as integer minor units. `Money` is an immutable value object with no `toNumber()` method — the footgun does not exist rather than being documented.

### 2. Registry over factory for payments
A factory with a switch statement still requires editing core code per provider. A `PaymentRegistry` resolves strategies by name; adding a provider is one new file plus one line in `bootstrap.ts`. `CheckoutService` has no provider-specific branching.

### 3. Concurrency-safe stock management
Read-check-write (find, then check, then update) lets two concurrent requests both read `stock = 1`, both pass the check, and both write `0` — overselling. The fix is a conditional atomic update:
```sql
UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty;
```
The check and the write are one statement. Zero rows affected means insufficient stock. A `CHECK (stock >= 0)` constraint is the hard backstop, and multi-item orders lock products in ascending ID order to avoid deadlocks.

### 4. Webhook idempotency
Payment providers guarantee at-least-once delivery, not exactly-once. `processed_webhook_events` carries a `UNIQUE(provider, event_id)` constraint; a duplicate insert fails and the handler returns `200 OK` without reprocessing. The database arbitrates, because an application-level "have I seen this?" check is itself a race.

### 5. Raw-body webhook parsing
Stripe signs the exact raw bytes of the request. If `express.json()` parses the body first, verification fails. The server mounts `express.raw()` for `/api/webhooks` before the global JSON parser.

### 6. Price snapshotting
Order items store the price at order time. A later catalogue price change must not retroactively alter a placed order — a correctness requirement, not an optimisation.

### 7. Rate limiting and proxy awareness
Auth routes (`/api/auth`) carry a strict limiter (5 attempts per 15 minutes) to blunt brute-force and credential stuffing; all routes share a looser global limiter. Behind a reverse proxy in production the app sets `trust proxy`, so `req.ip` reflects the real client IP rather than the proxy's — essential for the limiter to key on the correct address. Limits use an in-memory store here; a multi-instance deployment would swap in a Redis-backed store so the count is shared across servers.

### 8. Email verification
Registration creates the account as unverified and emails a 6-digit PIN, generated with `crypto.randomInt` (unbiased, unlike `Math.random`) and stored in Redis with a 10-minute TTL. The user confirms via `POST /api/auth/verify`; login is blocked until then. The PIN is compared with `timingSafeEqual` and consumed on success so it cannot be reused. Email delivery uses Nodemailer with Ethereal test SMTP in development — no credentials needed, and it prints a preview URL — while production sets real SMTP via `SMTP_*` env vars with no code change.

---

## Testing Strategy

Vitest for unit and integration tests; Supertest for HTTP-level tests. All 13 tests pass on a clean run.

```bash
npm test
npm run test:unit
```

Two integration tests carry the most weight:

1. `tests/integration/concurrency.test.ts` — ten concurrent buyers for a product with stock of 1; asserts exactly one succeeds and final stock is `0`, never negative.
2. `tests/integration/webhook-idempotency.test.ts` — the same success webhook delivered twice; asserts stock is decremented once and the order transitions to `PAID`. Tampered payloads with an invalid signature are rejected with `400`.

Also covered: DFS cycle termination, cache-hit query elimination, and the Redis-outage fallback. No test calls a real provider API.

---

## Known Constraints

- **Stripe:** Integrated and functional in test mode. Live keys are deliberately excluded from this repository; `STRIPE_SECRET_KEY` selects the key set from the environment.
- **bKash:** Implemented against the documented tokenized-checkout contract. Live and sandbox access require Bangladeshi merchant onboarding credentials, which are not obtainable for this exercise, so `BkashStrategy` is driven by mocked HTTP in tests. Swapping in real credentials is a configuration change, not a code change.
- **bKash webhooks:** The tokenized flow uses a browser callback redirect, not a signed server-to-server webhook. Treating the redirect as authoritative would let a user forge a successful payment, so confirmation always goes through server-side `execute` and `query` calls.
- **Live mode:** Not configured. Live payment credentials do not belong in an assessment repository.
