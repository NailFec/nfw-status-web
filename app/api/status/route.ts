import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { parseLimit, readJson } from "@/lib/http"
import { createStatus, listStatus } from "@/lib/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 100, 500)
    return Response.json({ segments: listStatus(limit) })
  })
}

export function POST(request: Request) {
  return handle(async () => {
    assertWriter(request)
    const segment = createStatus(await readJson(request))
    return Response.json(segment, { status: 201 })
  })
}
