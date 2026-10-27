import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { readForm } from "@/lib/http"
import { deleteMeal, updateMeal } from "@/lib/meals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { id } = await context.params
    const meal = await updateMeal(id, await readForm(request))
    return Response.json(meal)
  })
}

export function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertWriter(request)
    const { id } = await context.params
    deleteMeal(id)
    return new Response(null, { status: 204 })
  })
}
