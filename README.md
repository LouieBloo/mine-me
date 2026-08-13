# Need vs. Greed (NVG)

A browser-based, simplified MMORPG focused on the "Need vs. Greed" principle. Players gather resources, craft, trade on a global marketplace, and unite weekly to defeat world bosses for real-world currency rewards.


## Tech Stack
This project uses a modern **Turborepo** monorepo structure.
- **Client App:** React, PixiJS (via `@pixi/react`), Tailwind CSS, Vite
- **Admin App:** React, Tailwind CSS, Vite
- **Server:** Node.js (v24), Express.js, Socket.io, Prisma, PostgreSQL, Redis
- **Shared:** A dedicated TypeScript package for shared game logic and interfaces.
- **Testing:** Vitest across all workspaces.

---

## 🚀 Getting Started

### Prerequisites
1. **Node.js:** Ensure you are running **Node v24+** (Use `nvm use 24`).
2. **PostgreSQL:** A local or remote PostgreSQL database.
3. **Redis:** A local or remote Redis instance.

### 🐳 Setting up Infrastructure with Docker
For local development, you can quickly spin up PostgreSQL and Redis using Docker:

#### PostgreSQL:
```bash
docker run -d \
  --name nvg-postgres \
  -e POSTGRES_USER=luke \
  -e POSTGRES_PASSWORD=bigpoppa69 \
  -e POSTGRES_DB=nvg_db \
  -p 5432:5432 \
  -v nvg_postgres_data_v4:/var/lib/postgresql \
  postgres:latest
```

> [!NOTE]
> We use `/var/lib/postgresql` as the mount point to avoid directory permission and structure issues with Postgres 18+ images.

#### Redis:
```bash
docker run -d --name my-redis -p 6379:6379 redis:latest
```

### 1. Installation & Environment Setup
Run the following from the root of the project to set up your environment (installs dependencies and initializes the database):
```bash
npm run setup
```
This script will ensure you are on the correct Node version, install all workspace dependencies, and set up the Prisma database schema.

Alternatively, you can run the steps manually:
1. Ensure you are on Node v24 (`nvm use`).
2. Run `npm install`.
3. Set up the database (see below).

### 2. Environment Variables
Create a `.env` file inside `apps/server` with the following variables:
```env
# apps/server/.env

# The connection string for the Prisma schema
DATABASE_URL="postgresql://user:password@localhost:5432/nvg_db?schema=public"

# The connection string for the Redis client
REDIS_URL="redis://localhost:6379"

# The port the Express API will listen on
PORT=4000
```

*Note: The React apps (`client` and `admin`) do not require environment variables for local development at this stage, as they are configured to proxy or connect directly to the local server.*

### 3. Database Setup (Prisma)
Before running the server, you must generate the Prisma client and push the schema to your database.
```bash
cd apps/server
npx prisma db push
npx prisma generate
```

---

## 💻 CLI Commands (Turborepo)

From the **root** of the monorepo, you can run the following commands to manage the entire stack simultaneously:

### Start Development Servers
```bash
npm run dev
```
*This starts the Vite dev server for `client` (Port 3001), the Vite dev server for `admin` (Port 3002), runs the TypeScript compiler `tsc -w` for `@mine-me/shared`, and runs the Node API server (Port 4000) concurrently.*

### Build for Production
```bash
npm run build
```
*Builds all applications and packages in the correct dependency order using Turbo.*

### Run Tests
```bash
npm run test
```
*Executes `vitest` across `client`, `admin`, `server`, and `shared` to ensure system integrity and combat validation logic.*

### Run Linting
```bash
npm run lint
```