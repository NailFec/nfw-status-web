import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { readJson } from "@/lib/http"
import { deleteSleep, patchSleep } from "@/lib/sleep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ date: string }> }

export function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { date } = await context.params
    return Response.json(patchSleep(decodeURIComponent(date), await readJson(request)))
  })
}

export function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { date } = await context.params
    deleteSleep(decodeURIComponent(date))
    return new Response(null, { status: 204 })
  })
}
