export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCalendarScheduler } = await import("./lib/calendar")
    startCalendarScheduler()
  }
}
