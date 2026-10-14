# TeamFlow Project Manager

A modern project management starter built with **Next.js, React, TypeScript, and Tailwind CSS**. It includes a responsive project dashboard, Kanban board, task search and priority filtering, task creation, and drag-and-drop task movement.

## Features

- Responsive workspace dashboard
- Four Kanban columns: To do, In progress, In review, and Done
- Drag and drop tasks between columns
- Create tasks with priority, assignee, and status
- Search tasks by title, description, ID, or label
- Filter tasks by priority
- Summary cards and completion progress
- Reusable typed task model and seed data

## Tech stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Lucide icons

## Getting started

### Requirements

- Node.js 20.9 or newer
- npm

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
npm start
```

## Project structure

```text
teamflow-project-manager/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── teamflow-app.tsx
├── lib/
│   └── seed.ts
├── types/
│   └── task.ts
├── .gitignore
├── package.json
├── tailwind.config.ts
└── README.md
```

## Current limitations

This is a frontend starter. Tasks are stored in client-side React state, so changes reset when the page reloads. Authentication, database persistence, team management, and API routes are not implemented yet.

## Suggested next milestones

1. Add Prisma and PostgreSQL for persistent projects and tasks.
2. Add authentication and workspace membership.
3. Implement API routes with validation and authorization.
4. Add unit and integration tests.
5. Add GitHub Actions for linting, type-checking, and builds.
6. Deploy the app and document the live demo.

## License

MIT — add a `LICENSE` file if you intend to publish this project under the MIT license.
