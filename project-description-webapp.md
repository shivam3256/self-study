# Self-Study Center Management System — Project Description (Multi-Tenant SaaS)

## Overview

A multi-tenant SaaS product that helps self-study/reading center owners ("libraries") manage students, desk/seat allocation, fees, and payment reminders. Sold to multiple library owners as a subscription product, competing in the same space as SeatWise, ManageDesk, Libraryly, etc.

Delivered as a **responsive web application** — accessed via browser on desktop or mobile. No native mobile or desktop app required for v1; the frontend codebase can later be adapted (PWA, Capacitor, Tauri) if offline support or native distribution becomes a priority.

---

## Why This Architecture

- **Multi-tenant SaaS** → centralized backend, not per-library local hosting. Enables one codebase, one deployment, instant updates for all customers.
- **Web app** → simplest possible delivery: no service worker, no offline caching logic, no install prompts — just a backend-connected frontend. Fastest to build and easiest to maintain for v1.
- **Responsive design** → works on both desktop and mobile browsers from one codebase, so front-desk PCs and owner phones are both covered without separate builds.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React | Responsive web app (desktop + mobile browsers) |
| Backend | FastAPI (Python) | Async support for concurrent tenant operations |
| Database | PostgreSQL | Multi-tenant via `tenant_id` scoping on all tables |
| Background Jobs | Celery + Redis | Per-tenant scheduled WhatsApp reminders, recurring tasks |
| Messaging Gateway | WhatsApp Meta Cloud API | Meta Cloud API for automated renewal messages |
| Auth | JWT-based (fastapi-users or equivalent) | Multi-tenant login, role-based permissions |
| Billing | Razorpay | Recurring subscription billing (UPI/card) |
| Hosting | Railway / Render / Hetzner VPS | Cloud-hosted, centrally managed |
| Monitoring | Sentry (or similar) | Error tracking across all tenants |
| Containerization | Docker | For consistent deployment and scaling |

---

## Functional Modules

### 1. Platform / Tenant Management
- Onboarding flow: new library owner signs up, creates their "workspace" (tenant)
- Tenant-level settings: library name, address, branding (logo), operating hours, timezone
- Subscription plan selection and billing status
- Data isolation enforced via `tenant_id` on every query — no cross-tenant data leakage

### 2. Authentication & Roles
- Owner/admin login (JWT-based sessions)
- Support for multiple staff accounts per tenant with permission levels (e.g., owner vs. front-desk staff)
- Password reset, session expiry/refresh handling

### 3. Student Management
- Register student: name, phone, photo, ID proof, address, join date, emergency contact
- Edit/update student profile
- Student status: Active / Expired / Suspended / Paused
- Search and filter (by name, phone, plan, status, assigned desk)
- Pause/resume membership (e.g., student leaves temporarily)
- Bulk import students via CSV/Excel

### 4. Membership Plans
- Configurable plan types per tenant: monthly, quarterly, half-yearly, yearly
- Shift-based plans vs. full-access plans
- Custom pricing per plan, per tenant
- Trial/day-pass option for walk-ins

### 5. Desk / Seat Management
- Visual seat map (grid layout per tenant's actual floor plan)
- Seat categories: general, AC/non-AC, ladies-only, premium
- Assign desk to student per shift; same desk shareable across shifts by different students
- Real-time occupancy view: free vs. occupied per shift
- Conflict prevention: no double-booking of desk + shift + date range
- Vacate/reassign on membership end or pause

### 6. Slots / Shifts
- Define shifts per tenant (e.g., Morning, Afternoon, Evening, Full-day, Night)
- Configure shift timing and per-shift capacity
- Map desks to available shifts

### 7. Fee & Payment Management
- Fee structure tied to plan type (per tenant)
- Record payments: amount, date, mode (cash/UPI/card), receipt number
- Auto-calculate next due date from plan duration
- Outstanding dues report (who owes what, since when)
- Payment history per student
- Auto-generate/print/download receipts

### 8. Payment Reminders (SMS)
- Scheduled job (Celery) checks upcoming/overdue dues per tenant
- Sends SMS via gateway (e.g., 7/3/1 days before due date, and on overdue)
- Duplicate-prevention logging per student per billing cycle
- Reminder history viewable by admin
- (Future) WhatsApp Business API integration as an upgrade path

### 9. Attendance / Check-in
- QR code-based check-in/check-out per visit
- Tracks actual usage vs. paid membership
- Flags no-shows or irregular usage patterns

### 10. Dashboard & Reports
- Today's overview: check-ins, dues today, memberships expiring this week
- Occupancy report: seat utilization by shift/day
- Revenue report: collections by day/month/plan type
- Expiry report: students expiring in next N days
- Optional expense tracking (rent, electricity, wifi) for net profit visibility

### 11. Billing & Subscription (Platform-level)
- Subscription plans for library owners (the paying customers)
- Razorpay integration for recurring billing
- Trial period handling, plan upgrade/downgrade, payment failure handling

---

## Deferred for Later Versions
- Offline support (PWA-style caching) — can be added later if connectivity issues prove to be a real problem for customers
- Native mobile app (Capacitor-shelled) or desktop app (Tauri-shelled) — same codebase, added only if a concrete need arises (app store presence, native hardware access)
- WhatsApp Business API reminders
- Locker management
- Multi-branch management for a single owner

---

## Suggested Build Order
1. Multi-tenant backend foundation: tenant model, auth, `tenant_id` scoping on all core tables
2. Student, plan, desk, shift CRUD + seat allocation conflict logic
3. Fee/payment tracking + due date auto-calculation
4. React frontend: core admin screens (students, seat map, fees)
5. SMS reminder job (Celery + Redis) + gateway integration
7. Dashboard and reports
8. Billing/subscription integration (Razorpay) for onboarding paying tenants
9. Attendance/check-in (QR-based)
