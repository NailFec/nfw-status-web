import { assertWriter } from "@/lib/auth"
import { createSubscription, listSubscriptions } from "@/lib/calendar"
import { handle } from "@/lib/errors"
import { readJson } from "@/lib/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    assertWriter(request)
    return Response.json({ subscriptions: listSubscriptions() })
  })
}

export function POST(request: Request) {
  return handle(async () => {
    assertWriter(request)
    const subscription = await createSubscription(await readJson(request))
    return Response.json(subscription, { status: 201 })
  })
}
