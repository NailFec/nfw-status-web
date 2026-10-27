import { assertWriter } from "@/lib/auth"
import { handle, invalid } from "@/lib/errors"
import { readForm } from "@/lib/http"
import { addScreenshot } from "@/lib/sleep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return handle(async () => {
    assertWriter(request)
    const form = await readForm(request)
    const date = form.get("date")
    const files = form
      .getAll("photo")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    if (typeof date !== "string" || files.length !== 1 || !files[0]) {
      invalid()
    }
    const screenshot = await addScreenshot(date, files[0])
    return Response.json(screenshot, { status: 201 })
  })
}
