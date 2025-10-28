import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

export async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Database] DATABASE_URL not set, skipping migrations");
    return;
  }

  try {
    console.log("[Database] Running migrations...");
    
    // Create connection
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const db = drizzle(connection);

    // Run migrations
    await migrate(db, { migrationsFolder: "./drizzle" });
    
    console.log("[Database] Migrations completed successfully");
    
    // Close connection
    await connection.end();
  } catch (error) {
    console.error("[Database] Migration failed:", error);
    // Don't throw - allow server to start even if migrations fail
    // This prevents deployment failures if migrations have already been run
  }
}

