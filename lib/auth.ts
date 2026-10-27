import { createHash, timingSafeEqual } from "node:crypto"

import { ApiError } from "@/lib/errors"

function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest()
  const rightDigest = createHash("sha256").update(right).digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

export function assertWriter(request: Request): void {
  const expected = process.env.UPLOAD_TOKEN
  if (!expected) {
    throw new ApiError("unauthorized", 401)
  }
  const header = request.headers.get("authorization") ?? ""
  const prefix = "Bearer "
  if (!header.startsWith(prefix) || !safeEqual(header.slice(prefix.length), expected)) {
    throw new ApiError("unauthorized", 401)
  }
}
