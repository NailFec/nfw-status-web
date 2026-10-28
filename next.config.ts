import type { NextConfig } from "next"

import { BASE_PATH } from "./lib/base-path"

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  serverExternalPackages: ["better-sqlite3", "sharp"],
  allowedDevOrigins: ["127.0.0.1"],
}

export default nextConfig
