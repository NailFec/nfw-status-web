import { assertWriter } from "@/lib/auth"
import { handle } from "@/lib/errors"
import { listPhrases } from "@/lib/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return handle(async () => {
    assertWriter(request)
    return Response.json({ phrases: listPhrases() })
  })
}
