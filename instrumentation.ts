export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DB_MODE === "local") {
    const { startDailyBackup } = await import("@/lib/backup");
    startDailyBackup();
  }
}
