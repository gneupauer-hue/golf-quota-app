# Custom Golf League Demo

Mobile-first golf quota scoring app built with Next.js, TypeScript, Tailwind CSS, Prisma, and PostgreSQL.

## Local setup

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Set `DATABASE_URL` to your PostgreSQL connection string
4. (Optional) Set `TEAM_BUILDER_DEBUG=1` to enable team-builder debug output in local development
5. Run `npx prisma db push`
6. Run `npx prisma db seed`
7. Start the app with `npm run dev`

## Environment variables

- `DATABASE_URL` (required): PostgreSQL connection used by Prisma.
- `NODE_ENV` (runtime): standard Next.js mode switch.
- `TEAM_BUILDER_DEBUG` (optional): set to `1` for team builder debugging logs.

## Safe duplication and deployment process

1. Create a new GitHub repository (do not fork the Huntsville/Irem repo if you want isolated settings/history).
2. Push this codebase to that new repository and set its `origin` to the new repo.
3. Create a brand-new Vercel project from the new repository.
4. Provision a brand-new PostgreSQL database and credentials for the demo only.
5. Set only demo environment variables in the new Vercel project, especially a demo-only `DATABASE_URL`.
6. Run schema setup (`prisma db push` or migrations) and seed only demo-safe data.
7. Verify deployed metadata URL, runtime DB host/name/user, and write activity all point only to demo resources.
8. Lock down access so Huntsville and demo credentials/projects remain separate.

## Notes

- Historical rounds are preserved.
- Saving or editing a round recalculates every player's quota history so current quotas stay correct.
- `npx prisma db seed` safely restores the standard starter player list without duplicating players.
