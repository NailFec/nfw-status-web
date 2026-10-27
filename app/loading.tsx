import { PageFrame } from "@/components/page-frame"
import { StatusSkeleton } from "@/components/status-skeleton"

export default function Loading() {
  return (
    <PageFrame>
      <StatusSkeleton />
    </PageFrame>
  )
}
