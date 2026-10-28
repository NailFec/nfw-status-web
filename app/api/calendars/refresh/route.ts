import { assertWriter } from "@/lib/auth"
import { refreshCalendars } from "@/lib/calendar"
import { handle } from "@/lib/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return handle(async () => {
    assertWriter(request)
    await refreshCalendars()
    return new Response(null, { status: 204 })
  })
}
