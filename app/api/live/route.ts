import { subscribe } from "@/lib/live"
import type { LiveKind } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const stop = () => {
    if (closed) {
      return
    }
    closed = true
    if (heartbeat) {
      clearInterval(heartbeat)
    }
    unsubscribe()
  }

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribe((kind: LiveKind) => {
        if (closed) {
          return
        }
        controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify({ kind })}\n\n`))
      })
      heartbeat = setInterval(() => {
        if (closed) {
          return
        }
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"))
        } catch {
          stop()
        }
      }, 25_000)
      request.signal.addEventListener("abort", () => {
        stop()
        try {
          controller.close()
        } catch {
          // The stream is already closed.
        }
      })
    },
    cancel() {
      stop()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
