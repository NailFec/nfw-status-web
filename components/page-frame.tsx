import { cn } from "@/lib/utils"

export function PageFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main
      id="content"
      tabIndex={-1}
      className={cn(
        "mx-auto flex min-h-svh w-full max-w-7xl min-w-0 flex-col gap-6",
        "pt-[max(1.5rem,env(safe-area-inset-top))]",
        "pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
        "pl-[max(1rem,env(safe-area-inset-left))]",
        className,
      )}
    >
      {children}
    </main>
  )
}
