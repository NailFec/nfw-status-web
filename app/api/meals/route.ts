import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { parseBefore, parseLimit, readForm } from "@/lib/http"
import { createMeal, listMeals } from "@/lib/meals"
import { todayKey } from "@/lib/time"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams
    const before = parseBefore(params.get("before"), todayKey())
    const limit = parseLimit(params.get("limit"), 60, 200)
    const beforeId = params.get("beforeId")
    const page = await listMeals(
      before,
      limit,
      beforeId && beforeId.length > 0 ? beforeId : undefined,
    )
    return Response.json(page)
  })
}

export function POST(request: Request) {
  return handle(async () => {
    assertWriter(request)
    const meal = await createMeal(await readForm(request))
    return Response.json(meal, { status: 201 })
  })
}
