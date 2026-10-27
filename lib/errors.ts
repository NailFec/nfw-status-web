export type ErrorCode = "unauthorized" | "invalid" | "overlap" | "not_found" | "exists"

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly extra?: Record<string, string>

  constructor(code: ErrorCode, status: number, extra?: Record<string, string>) {
    super(code)
    this.name = "ApiError"
    this.code = code
    this.status = status
    this.extra = extra
  }
}

export function errorResponse(error: ApiError): Response {
  return Response.json({ error: error.code, ...error.extra }, { status: error.status })
}

export function invalid(): never {
  throw new ApiError("invalid", 400)
}

export function notFound(): never {
  throw new ApiError("not_found", 404)
}

export async function handle(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error)
    }
    throw error
  }
}
