import { handle } from "@/lib/errors"
import { loadToday } from "@/lib/today"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return handle(async () => Response.json(await loadToday()))
}
