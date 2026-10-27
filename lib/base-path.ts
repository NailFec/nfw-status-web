/** Must match `basePath` in next.config.ts. */
export const BASE_PATH = "/status"

export function withBasePath(path: string): string {
  if (path.startsWith("/")) {
    return `${BASE_PATH}${path}`
  }
  return `${BASE_PATH}/${path}`
}
