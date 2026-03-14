# Need vs. Greed (NVG)

A browser-based, simplified MMORPG focused on the "Need vs. Greed" principle. Players gather resources, craft, trade on a global marketplace, and unite weekly to defeat world bosses for real-world currency rewards.

## Tech Stack
This project uses a modern **Turborepo** monorepo structure.
- **Client App:** React, PixiJS (via `@pixi/react`), Tailwind CSS, Vite
- **Admin App:** React, Tailwind CSS, Vite
- **Server:** Node.js (v20+), Express.js, Socket.io, Prisma, PostgreSQL
- **Shared:** A dedicated TypeScript package for shared game logic and interfaces.
- **Testing:** Vitest across all workspaces.

---

## 🚀 Getting Started

### Prerequisites
1. **Node.js:** Ensure you are running **Node v20+** (Use `nvm use 20`).
2. **PostgreSQL:** A local or remote PostgreSQL database.

### 1. Installation
Run the following from the root of the project to install dependencies across all workspaces:
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file inside `apps/server` with the following variables:
```env
# apps/server/.env

# The connection string for the Prisma schema
DATABASE_URL="postgresql://user:password@localhost:5432/nvg_db?schema=public"

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
*This starts the Vite dev server for `client` (Port 3001), the Vite dev server for `admin` (Port 3002), runs the TypeScript compiler `tsc -w` for `@nvg/shared`, and runs the Node API server (Port 4000) concurrently.*

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