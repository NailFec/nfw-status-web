"use client"

import { useCallback, useEffect, useState } from "react"

import { MealStrip } from "@/components/meal-strip"
import { SleepPanel } from "@/components/sleep-panel"
import { TodayPanel } from "@/components/today-panel"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { LiveKind, Meal, SleepDay, TodayPayload } from "@/lib/types"

export function StatusBoard({
  initial,
}: {
  initial: { today: TodayPayload; meals: Meal[]; sleep: SleepDay[] }
}) {
  const [today, setToday] = useState(initial.today)
  const [meals, setMeals] = useState(initial.meals)
  const [sleep, setSleep] = useState(initial.sleep)
  const [now, setNow] = useState(initial.today.now)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)

  const reload = useCallback(async (kind: LiveKind | "visible") => {
    const todayResponse = await fetch("/api/today", { cache: "no-store" })
    if (!todayResponse.ok) {
      throw new Error("today")
    }
    const nextToday = (await todayResponse.json()) as TodayPayload
    setToday(nextToday)
    setNow(nextToday.now)
    if (kind === "meal" || kind === "visible") {
      const response = await fetch(
        `/api/meals?before=${encodeURIComponent(nextToday.day)}&limit=60`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error("meals")
      }
      const body = (await response.json()) as { meals: Meal[] }
      setMeals(body.meals)
    }
    if (kind === "sleep" || kind === "visible") {
      const response = await fetch(
        `/api/sleep?before=${encodeURIComponent(nextToday.day)}&limit=400`,
        { cache: "no-store" },
      )
      if (!response.ok) {
        throw new Error("sleep")
      }
      const body = (await response.json()) as { days: SleepDay[] }
      setSleep(body.days)
    }
  }, [])

  useEffect(() => {
    setNow(today.now)
  }, [today.now])

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date().toISOString())
    }, 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let source: EventSource | null = null
    let timer: number | null = null
    let stopped = false

    const connect = () => {
      source = new EventSource("/api/live")
      source.addEventListener("update", (event) => {
        try {
          const data = JSON.parse(String((event as MessageEvent).data)) as { kind?: string }
          if (
            data.kind === "status" ||
            data.kind === "meal" ||
            data.kind === "sleep" ||
            data.kind === "calendar"
          ) {
            void reload(data.kind)
              .then(() => setError(false))
              .catch(() => setError(true))
          }
        } catch {
          setError(true)
        }
      })
      source.onerror = () => {
        source?.close()
        source = null
        if (!stopped) {
          timer = window.setTimeout(connect, 2000)
        }
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reload("visible")
          .then(() => setError(false))
          .catch(() => setError(true))
      }
    }

    connect()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      source?.close()
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [reload])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">Couldn’t refresh</p>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setPending(true)
              void reload("visible")
                .then(() => setError(false))
                .catch(() => setError(true))
                .finally(() => setPending(false))
            }}
          >
            {pending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            Retry
          </Button>
        </div>
      ) : null}
      <TodayPanel today={today} now={now} />
      <MealStrip meals={meals} timeZone={today.timezone} today={today.day} />
      <SleepPanel days={sleep} timeZone={today.timezone} today={today.day} />
    </div>
  )
}
