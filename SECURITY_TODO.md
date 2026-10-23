# LCOS Security Audit & Technical Debt: Legacy Auth Routes TODO

## Overview
This document tracks routes currently using the legacy `authenticateToken` (which provides an auto-fallback to `SUPER_ADMIN` in zero-config development mode) and `authorizeRoles` (which does not abort requests with a 403 when a role mismatch occurs).

These routes must be systematically migrated to use `requireRealAuth(...allowedRoles)` in production environments to prevent privilege escalation.

---

## 1. High-Priority Routes Pending Migration

| Route File | Endpoint & Method | Current Allowed Roles | Security Risk / Action Required |
| :--- | :--- | :--- | :--- |
| `server/routes/admin.routes.js` | `POST /api/admin/settings` | `SUPER_ADMIN`, `OWNER` | System settings alteration without strict token verification. |
| `server/routes/admin.routes.js` | `GET /api/admin/saas-stats` | `SUPER_ADMIN` | Platform metrics exposed if unauthenticated. |
| `server/routes/audit.routes.js` | `GET /api/audit-logs` | `SUPER_ADMIN`, `OWNER` | Audit trail leakage across tenant boundaries. |
| `server/routes/user.routes.js` | `POST /api/users` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | Unauthorized user provisioning. |
| `server/routes/user.routes.js` | `GET /api/users` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | User directory exposure. |
| `server/routes/subscription.routes.js` | `POST /api/subscriptions/plans`| `SUPER_ADMIN` | Modification of billing plan pricing and parameters. |
| `server/routes/payment.routes.js` | `GET /api/payments/history` | `SUPER_ADMIN`, `OWNER` | Financial ledger visibility. |
| `server/routes/request.routes.js` | `POST /api/requests/:id/approve` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | Approval of driver/vehicle resource requests. |
| `server/routes/trip.routes.js` | `POST /api/trips` | `SUPER_ADMIN`, `OWNER`, `TRACKING_TEAM`, `BRANCH_MANAGER` | Creation of rogue freight trips. |
| `server/routes/trip.routes.js` | `POST /api/trips/assign-backload` | `SUPER_ADMIN`, `OWNER`, `TRACKING_TEAM`, `BRANCH_MANAGER` | Unauthorized return trip reallocation. |
| `server/routes/stock.routes.js` | `POST /api/stock/add` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | Manual stock balance injection without physical audit. |
| `server/routes/branch.routes.js` | `POST /api/branches` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | Branch creation and modification. |
| `server/routes/commodity.routes.js` | `POST /api/commodities` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | Commodity unit value alterations. |
| `server/routes/company.routes.js` | `GET /api/companies` | `SUPER_ADMIN`, `OWNER` | Tenant company list exposure. |
| `server/routes/driver.routes.js` | `POST /api/drivers` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER`, `TRACKING_TEAM` | Driver directory alteration. |
| `server/routes/vehicle.routes.js` | `POST /api/vehicles` | `SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER` | Fleet inventory registration. |

---

## 2. Hardened Routes (Completed)
- `POST /api/vehicles/:id/device-key`: Protected with `requireRealAuth('SUPER_ADMIN', 'OWNER')`, tenant ownership check, and audit logging.
- `POST /api/gps/update`: Protected with driver active-trip validation / device key SHA-256 comparison.
- `POST /api/gps/batch`: Protected with driver active-trip validation / device key SHA-256 comparison.
- `Socket.IO handshake`: Protected with strict JWT verification (`io.use`), auto-company room assignment, and expiry timers.
- `Socket.IO join_trip`: Verified against `socket.user.companyId`.

---

## 4. Demo Credentials & Tunnel Exposure Warning
> [!WARNING]
> **Demo Credentials & Public Tunnels:**
> - When running tunnel testing (e.g. `npm run tunnel:test`, cloudflared, ngrok), the entire application is exposed externally over HTTPS.
> - Pre-seeded demo credentials (such as `driver1` / `driver123`) and quick-login demo role cards (`SUPER_ADMIN`, `OWNER`, `BRANCH_MANAGER`, `TRACKING_TEAM`) allow immediate full access to system management features.
> - **Mandatory Action Before Production Deployment:**
>   1. Disable or delete all pre-seeded demo user accounts from the database.
>   2. Remove or disable demo role switcher cards on the frontend dashboard.
>   3. Ensure a cryptographically strong, non-default `JWT_SECRET` is configured in environment variables (the server will refuse to boot in production if missing or placeholder).
>   4. Enforce `requireRealAuth` across all operational routes listed above.
