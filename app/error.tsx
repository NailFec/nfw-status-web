"use client"

import { useState } from "react"

import { PageFrame } from "@/components/page-frame"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const [pending, setPending] = useState(false)

  return (
    <PageFrame>
      <Empty className="px-6 py-16">
        <EmptyHeader>
          <EmptyTitle>Couldn’t load status</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button
            disabled={pending}
            onClick={() => {
              setPending(true)
              reset()
            }}
          >
            {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    </PageFrame>
  )
}
