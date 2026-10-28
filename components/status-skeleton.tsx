import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function StatusSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only">Loading…</p>
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-2/3" />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-11 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-3 w-4" />
            <Skeleton className="h-3 w-4" />
          </div>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Skeleton className="size-40 shrink-0" />
            <Skeleton className="size-40 shrink-0" />
            <Skeleton className="size-40 shrink-0" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-44 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
