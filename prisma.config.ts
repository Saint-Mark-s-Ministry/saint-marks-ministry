import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Match Next.js local overrides. Explicit process environment retains precedence.
config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
