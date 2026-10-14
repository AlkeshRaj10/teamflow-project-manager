# TeamFlow Project Manager

A project dashboard built with Next.js, backed by a NestJS authentication API and PostgreSQL persistence through Prisma.

## Requirements

- Node.js 20.9 or newer
- npm
- PostgreSQL 14 or newer

## Configure the API and database

Copy `backend/.env.example` to `backend/.env`, then set `DATABASE_URL` to a PostgreSQL database you control. Copy the `AUTH_API_URL` setting from `.env.example` to the root `.env.local` if the API is not running at its default local URL.

```text
backend/.env:
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
FRONTEND_ORIGIN="http://localhost:3000"
PORT=4000

.env.local:
AUTH_API_URL="http://localhost:4000"
```

Use unique, private credentials and a strong `DATABASE_URL` in deployed environments. The session cookie is marked `Secure` automatically when `NODE_ENV=production`.

Install the frontend dependencies from the repository root and the API dependencies from `backend/`:

```bash
npm install
npm install --prefix backend
```

Apply the initial schema and start both applications in separate terminals:

```bash
npm run prisma:migrate --prefix backend -- --name init
npm run start:dev --prefix backend
npm run dev
```

The Next.js app is available at [http://localhost:3000](http://localhost:3000). The NestJS API listens on port 4000 by default. Next.js proxies browser requests through `/api/auth/*`, `/api/workspaces/*`, `/api/projects/*`, and `/api/tasks/*` so the browser and session cookie remain same-origin. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin.

## Authentication

- Register at `/register`; a successful registration creates an authenticated session.
- Sign in at `/login`; `/dashboard` and `/` require a valid session.
- The API exposes `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, and protected `GET /auth/me`.
- Passwords are hashed with bcrypt. Sessions use random opaque tokens; only SHA-256 token digests are stored in PostgreSQL and expired/revoked sessions are rejected.
- The HTTP-only cookie uses `SameSite=Lax`, `Secure` in production, and a seven-day lifetime. Mutating API requests must have the configured frontend `Origin`.
- Login attempts are limited to five per minute per client IP. Configure `TRUST_PROXY_HOPS` to match the trusted reverse-proxy chain (default: one Next.js proxy); keep the API private behind that proxy so clients cannot forge forwarding headers. The in-memory throttler store is suitable for a single API instance; multi-instance deployments should configure a shared throttler store.
- API errors use a consistent JSON response shape. Validation is enforced by NestJS in addition to browser-side form checks.

## Workspaces

- Authenticated users can create, list, rename, and delete workspaces. The creator becomes an `OWNER`.
- `OWNER`, `ADMIN`, and `MEMBER` permissions are enforced by the API. Only owners can change roles or delete workspaces; owners and admins can rename workspaces, while admins can invite or remove members but cannot manage admins or owners.
- Owners and admins can create in-app invitations for normalized email addresses. Invitation links contain a random one-time token; only its SHA-256 digest is stored. Links expire after seven days and can only be accepted by an account with the invited email.
- Invitations are not emailed. Copy and share the generated invitation link directly; no email provider is configured.
- The workspace UI is available from the dashboard selector and each workspace's Members link. Workspaces and memberships are persisted in PostgreSQL.

## Projects and tasks

- Projects belong to workspaces. Owners and admins can create, edit, and archive them. Archiving is soft and irreversible through the MVP API: tasks remain stored but become read-only and disappear from the normal project list. Deleting a workspace cascades to its projects and tasks.
- Tasks belong to projects. Any workspace member can create and update tasks; only the task creator or a workspace owner/admin can permanently delete one. Removing a workspace member clears that member's task assignments and creator reference without deleting tasks.
- Assignees are stored as workspace memberships and must be members of the project's workspace. Task list filters include status, priority, assignee, and case-insensitive search; results are paginated.
- Task updates require the current `version`; stale updates return `409 Conflict`. Allowed status transitions are `TODO → IN_PROGRESS`, `IN_PROGRESS → TODO/REVIEW`, `REVIEW → IN_PROGRESS/DONE`, and `DONE → REVIEW`. Same-status updates are allowed.
- The dashboard loads projects, tasks, team members, pagination, and project summary counts from the API. Task/project changes persist in PostgreSQL; the former sample tasks are no longer used.
- Apply pending schema migrations with `npm run prisma:migrate --prefix backend` in development or `prisma migrate deploy` in deployment environments. The new migration is `backend/prisma/migrations/20261014183000_projects_tasks`.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npm test --prefix backend
npm run build --prefix backend
```

The backend tests exercise account creation, duplicate normalized emails, password failures, login, protected routes, logout/session expiry, CSRF origin checks, login rate limiting, workspace isolation, role permissions, invitation expiry and acceptance, duplicate membership, last-owner protection, project authorization, task CRUD rules, assignment validation, filtering, pagination, task status transitions, optimistic concurrency, and summaries. They use isolated Prisma test doubles; running the actual service still requires PostgreSQL.
