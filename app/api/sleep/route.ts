import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { parseBefore, parseLimit, readJson } from "@/lib/http"
import { listSleep, saveSleep, sleepDates } from "@/lib/sleep"
import { todayKey } from "@/lib/time"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams
    if (params.get("fields") === "date") {
      return Response.json({ dates: sleepDates() })
    }
    const before = parseBefore(params.get("before"), todayKey())
    const rawLimit = params.get("limit")
    const limit =
      rawLimit == null || rawLimit === ""
        ? undefined
        : parseLimit(rawLimit, 30, 500)
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
