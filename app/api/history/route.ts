import { handle } from "@/lib/errors"
import { parseBefore, parseLimit } from "@/lib/http"
import { todayKey } from "@/lib/time"
import { historyPageDays, loadHistory } from "@/lib/today"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams
    const end = parseBefore(params.get("end"), todayKey())
    const limit = parseLimit(params.get("limit"), historyPageDays, historyPageDays)
    return Response.json(loadHistory(end, limit))
  })
}
