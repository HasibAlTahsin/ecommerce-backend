# E-Commerce Ordering & Payment System

A production-grade, highly concurrent backend for an e-commerce platform. Built with Node.js, TypeScript, and Express, featuring a multi-provider payment architecture, atomic stock management, and robust webhook idempotency.

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)

---

## Table of Contents
1. [Overview](#-overview)
2. [Key Features](#-key-features)
3. [Tech Stack](#-tech-stack)
4. [Prerequisites](#-prerequisites)
5. [Installation & Local Setup](#-installation--local-setup)
6. [Environment Variables](#-environment-variables)
7. [API Documentation & Usage](#-api-documentation--usage)
8. [Architecture & Design Decisions](#-architecture--design-decisions)
9. [Testing Strategy](#-testing-strategy)
10. [Known Constraints](#-known-constraints)

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
- **Security First:** Argon2id password hashing, JWT authentication, rate limiting on auth and global routes, non-root Docker containers, and Zod strict-input validation.

---

## Tech Stack
- **Runtime & Language:** Node.js (v20), TypeScript
- **Web Framework:** Express.js
- **Database & ORM:** PostgreSQL, Prisma
- **Caching:** Redis (via ioredis)
- **Payment Gateways:** Stripe API, bKash Tokenized Checkout
- **API Docs:** Swagger UI (OpenAPI 3)
- **Testing:** Vitest, Supertest
- **Containerization:** Docker, Docker Compose

---

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) (v20 or higher)
- npm (bundled with Node.js)

---

## Installation & Local Setup

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

**4. Start infrastructure (PostgreSQL & Redis)**
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
| `STRIPE_SECRET_KEY` | Stripe **test** secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `MOCK_PAYMENTS_ENABLED` | Toggle the Mock provider | `true` |
| `BKASH_ENABLED` | Toggle the bKash provider | `false` |

> Live keys must never be committed. `.env` is gitignored; `.env.example` documents the shape only.

---

## API Documentation & Usage

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

### 2. Products
```bash
curl http://localhost:3000/api/products
```

### 3. Orders & Checkout
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

---

## Architecture & Design Decisions

The codebase is organised in four layers with dependencies pointing inward only:
`interfaces/http` → `application` → `domain` ← `infrastructure`. Nothing in `src/domain` imports anything with I/O.

### 1. Money as integer minor units
Floating-point math corrupts currency (`0.1 + 0.2 = 0.30000000000000004`). All monetary values are stored and computed as integer minor units. `Money` is an immutable value object with no `toNumber()` method — the footgun does not exist rather than being documented.

### 2. Registry over factory for payments
A factory with a switch statement still requires editing core code per provider. A `PaymentRegistry` resolves strategies by name; adding a provider is one new file plus one line in `bootstrap.ts`. `CheckoutService` has no provider-specific branching.

### 3. Concurrency-safe stock management
Read-check-write (`findUnique` → check → `update`) lets two concurrent requests both read `stock = 1`, both pass the check, and both write `0` — overselling. The fix is a conditional atomic update:
```sql
UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty;
```
The check and the write are one statement. Zero rows affected means insufficient stock. A `CHECK (stock >= 0)` constraint is the hard backstop, and multi-item orders lock products in ascending ID order to avoid deadlocks.

### 4. Webhook idempotency
Payment providers guarantee *at-least-once* delivery, not exactly-once. `processed_webhook_events` carries a `UNIQUE(provider, event_id)` constraint; a duplicate insert fails and the handler returns `200 OK` without reprocessing. The database arbitrates, because an application-level "have I seen this?" check is itself a race.

### 5. Raw-body webhook parsing
Stripe signs the exact raw bytes of the request. If `express.json()` parses the body first, verification fails. The server mounts `express.raw()` for `/api/webhooks` **before** the global JSON parser.

### 6. Price snapshotting
Order items store the price at order time. A later catalogue price change must not retroactively alter a placed order — a correctness requirement, not an optimisation.

### 7. Rate limiting & proxy awareness
Auth routes (`/api/auth`) carry a strict limiter (5 attempts per 15 minutes) to blunt brute-force and credential stuffing; all routes share a looser global limiter. Behind a reverse proxy in production the app sets `trust proxy`, so `req.ip` reflects the real client IP rather than the proxy's — essential for the limiter to key on the correct address. Limits use an in-memory store here; a multi-instance deployment would swap in a Redis-backed store so the count is shared across servers.

---

## Testing Strategy

Vitest for unit and integration tests; Supertest for HTTP-level tests. All 13 tests pass on a clean run.

```bash
npm test            # unit + integration
npm run test:unit   # domain only, no containers required
```

Two integration tests carry the most weight:

1. **`tests/integration/concurrency.test.ts`** — ten concurrent buyers for a product with stock of 1; asserts exactly one succeeds and final stock is `0`, never negative.
2. **`tests/integration/webhook-idempotency.test.ts`** — the same success webhook delivered twice; asserts stock is decremented once and the order transitions to `PAID`. Tampered payloads with an invalid signature are rejected with `400`.

Also covered: DFS cycle termination, cache-hit query elimination, and the Redis-outage fallback. No test calls a real provider API.

---

## nown Constraints

- **Stripe:** Integrated and functional in **test mode**. Live keys are deliberately excluded from this repository; `STRIPE_SECRET_KEY` selects the key set from the environment.
- **bKash:** Implemented against the documented tokenized-checkout contract. Live and sandbox access require Bangladeshi merchant onboarding credentials, which are not obtainable for this exercise, so `BkashStrategy` is driven by mocked HTTP in tests. Swapping in real credentials is a configuration change, not a code change.
- **bKash webhooks:** The tokenized flow uses a browser callback redirect, not a signed server-to-server webhook. Treating the redirect as authoritative would let a user forge a successful payment, so confirmation always goes through server-side `execute` and `query` calls.
- **Live mode:** Not configured. Live payment credentials do not belong in an assessment repository.
