# Golf Quota Tracker

Mobile-first golf quota scoring app built with Next.js, TypeScript, Tailwind CSS, Prisma, and PostgreSQL.

## Local setup

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env`
3. Set `DATABASE_URL` to your PostgreSQL connection string
4. Run `npx prisma db push`
5. Run `npx prisma db seed`
6. Start the app with `npm run dev`

## Notes

- Historical rounds are preserved.
- Saving or editing a round recalculates every player's quota history so current quotas stay correct.
- `npx prisma db seed` safely restores the standard starter player list without duplicating players.
