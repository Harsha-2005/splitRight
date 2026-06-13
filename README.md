# SplitRight — Shared Expenses App

A full-stack shared expense tracker built for a group of flatmates. Import messy CSVs, track multi-currency expenses across changing membership, settle debts, and drill down into every balance.

## Live Demo

> Deployed URL: _[add after deployment]_

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | PostgreSQL (via Prisma ORM) |
| Auth | JWT + bcrypt |
| Currency | frankfurter.app (free historical rates API) |
| Fuzzy matching | fuse.js |
| CSV parsing | csv-parse |
| Deployment | Railway (backend + DB) + Vercel (frontend) |

## Setup Instructions

### Prerequisites
- Node.js v18+
- PostgreSQL 14+ running locally (or use a cloud DB)

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/spretail.git
cd spretail

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure environment

**Backend** — copy `.env.example` to `.env` and fill in:
```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET
```

**Frontend** — the `.env` file already points to `http://localhost:3001/api`.

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run locally

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173

### 5. Import the CSV

1. Register an account and create a group
2. Add all flatmates as members (with correct join dates)
3. Navigate to **Import CSV** and upload `Expenses Export.csv`
4. Review the anomalies and make decisions
5. Commit the import

## AI Tool Used

**Antigravity IDE (Gemini/Claude)** — Used as pair programming collaborator throughout the build.

See `AI_USAGE.md` for details on prompts, correct outputs, and cases where the AI made mistakes.

## Repository Structure

```
spretail/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   ├── src/
│   │   ├── index.js            # Express server
│   │   ├── lib/
│   │   │   ├── prisma.js       # DB client
│   │   │   ├── splitEngine.js  # Balance calculation
│   │   │   ├── currency.js     # Exchange rate fetcher
│   │   │   └── csvAnomalyDetector.js  # All 19 anomaly checks
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   └── errorHandler.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── groups.js
│   │       ├── expenses.js
│   │       ├── balances.js
│   │       ├── settlements.js
│   │       └── import.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/          # LoginPage, RegisterPage, DashboardPage, GroupPage,
│   │   │                     ExpensesPage, BalancePage, ImportPage
│   │   ├── components/     # Layout
│   │   ├── contexts/       # AuthContext
│   │   └── lib/            # api.js (axios client)
│   └── package.json
├── Expenses Export.csv     # The original data file
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```
