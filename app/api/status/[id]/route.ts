import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { readJson } from "@/lib/http"
import { deleteStatus, updateStatus } from "@/lib/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { id } = await context.params
    const segment = updateStatus(id, await readJson(request))
    return Response.json(segment)
  })
}

export function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { id } = await context.params
    deleteStatus(id)
    return new Response(null, { status: 204 })
  })
}
