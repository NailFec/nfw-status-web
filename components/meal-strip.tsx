"use client"

import { useEffect, useRef, useState } from "react"

import { HorizontalScroll } from "@/components/horizontal-scroll"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { BASE_PATH, withBasePath } from "@/lib/base-path"
import { formatDayLabel, formatTime } from "@/lib/format"
import { slotLabel } from "@/lib/labels"
import type { Meal } from "@/lib/types"
import { cn } from "@/lib/utils"

export function MealStrip({
  meals,
  timeZone,
  today,
  onNearStart,
  preserveKey,
}: {
  meals: Meal[]
  timeZone: string
  today: string
  onNearStart?: () => void
  preserveKey?: string
}) {
  const ordered = [...meals].reverse()

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Meals</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <Empty className="px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>No meals</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <HorizontalScroll
            label="Meals"
            pinned
            pinKey={ordered.length}
            preserveKey={preserveKey}
            onNearStart={onNearStart}
          >
            <div className="flex w-max gap-4 p-1">
              {ordered.map((meal, index) => {
                const eager = index >= Math.max(0, ordered.length - 4)
                const dateLabel = formatDayLabel(meal.day, timeZone, today)
                return (
                  <article
                    key={meal.id}
                    className="flex w-max shrink-0 flex-col gap-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium tabular-nums">
                        {dateLabel}
                      </p>
                      <p className="text-sm">{slotLabel[meal.slot]}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {formatTime(meal.eatenAt, timeZone)}
                      </p>
                    </div>
                    {meal.photos.length > 0 ? (
                      <div className="flex gap-2">
                        {meal.photos.map((photo) => (
                          <MealPhotoFrame
                            key={photo.id}
                            src={photoSrc(photo.url)}
                            preview={photo.preview}
                            alt={`${slotLabel[meal.slot]}, ${dateLabel}`}
                            eager={eager}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        className="size-40 rounded-md bg-muted"
                        aria-hidden
                      />
                    )}
                  </article>
                )
              })}
            </div>
          </HorizontalScroll>
        )}
      </CardContent>
    </Card>
  )
}

function MealPhotoFrame({
  src,
  preview,
  alt,
  eager,
}: {
  src: string
  preview: string | null
  alt: string
  eager: boolean
}) {
  const [ready, setReady] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const image = imageRef.current
    setReady(Boolean(image && image.complete && image.naturalWidth > 0))
  }, [src])
  return (
    <span className="relative block size-40 overflow-hidden rounded-md bg-muted">
      {preview ? (
        <img
          src={preview}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 size-full scale-110 object-cover blur-md transition-[filter] duration-300",
            ready && "blur-none"
          )}
        />
      ) : null}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        width={160}
        height={160}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setReady(true)}
        className={cn(
          "relative size-full object-cover transition-opacity duration-300",
          ready ? "opacity-100" : "opacity-0"
        )}
      />
    </span>
  )
}

function photoSrc(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  if (url === BASE_PATH || url.startsWith(`${BASE_PATH}/`)) {
    return url
  }
  return withBasePath(url)
}
