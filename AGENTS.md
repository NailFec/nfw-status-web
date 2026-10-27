<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:shadcn-agent-rules -->
# shadcn/ui rules

This project uses Next.js with React, shadcn/ui, and Tailwind CSS.

Use pnpm for all package management commands. Do not use npm, yarn, or bun unless explicitly requested.

Use the Base UI variant of shadcn/ui components by default. Do not add Radix UI dependencies, imports, or component variants unless the existing project configuration already uses Radix UI or the task explicitly asks for Radix.

Before adding a shadcn/ui component, inspect `components.json`, `package.json`, and the existing files under `components/ui/`.
<!-- END:shadcn-agent-rules -->

<!-- BEGIN:when-writing-code -->
# Code writing rules

Before writing new code, inspect existing pages and components to match the current code style, page structure, visual design, naming patterns, and Tailwind usage.

Prefer shadcn/ui components when they fit the use case. Check the latest available shadcn/ui components before creating custom UI from scratch.

Use Tailwind CSS carefully and consistently. Keep spacing, typography, colors, borders, radius, shadows, and responsive behavior aligned across pages and components.
<!-- END:when-writing-code -->

<!-- BEGIN:AI -->
Always read the [.nailfec/about.md](.nailfec/about.md) file.
<!-- END:AI -->
