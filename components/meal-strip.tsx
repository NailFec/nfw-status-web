"use client"

import { HorizontalScroll } from "@/components/horizontal-scroll"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatDayLabel, formatTime } from "@/lib/format"
import { slotLabel } from "@/lib/labels"
import type { Meal } from "@/lib/types"

export function MealStrip({
  meals,
  timeZone,
  today,
}: {
  meals: Meal[]
  timeZone: string
  today: string
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
          <HorizontalScroll label="Meals" pinned pinKey={ordered.length}>
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
                          <img
                            key={photo.id}
                            src={photo.url}
                            alt={`${slotLabel[meal.slot]}, ${dateLabel}`}
                            width={160}
                            height={160}
                            loading={eager ? "eager" : "lazy"}
                            decoding="async"
                            className="aspect-square w-40 rounded-md object-cover"
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
