import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { parseBefore, parseLimit, readJson } from "@/lib/http"
import { listSleep, saveSleep } from "@/lib/sleep"
import { todayKey } from "@/lib/time"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams
    const before = parseBefore(params.get("before"), todayKey())
    const limit = parseLimit(params.get("limit"), 30, 200)
    return Response.json({ days: listSleep(before, limit) })
  })
}

export function POST(request: Request) {
  return handle(async () => {
    assertWriter(request)
    const day = saveSleep(await readJson(request))
    return Response.json(day)
  })
}
