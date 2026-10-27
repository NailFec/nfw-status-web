import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { deletePhrase } from "@/lib/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { id } = await context.params
    deletePhrase(id)
    return new Response(null, { status: 204 })
  })
}
