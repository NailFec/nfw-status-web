"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { MealStrip } from "@/components/meal-strip"
import { SleepPanel } from "@/components/sleep-panel"
import { TodayPanel } from "@/components/today-panel"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { withBasePath } from "@/lib/base-path"
import { addDays, dayKey, zonedMidnight } from "@/lib/time"
import type {
  DayTimeline,
  HistoryPage,
  LiveKind,
  Meal,
  SleepDay,
  TodayPayload,
} from "@/lib/types"

const mealPageSize = 30
const sleepPageSize = 100

export function StatusBoard({
  initial,
}: {
  initial: {
    today: TodayPayload
    meals: Meal[]
    mealsHasMore: boolean
    sleep: SleepDay[]
    sleepHasMore: boolean
  }
}) {
  const [today, setToday] = useState(initial.today)
  const [history, setHistory] = useState(initial.today.history)
  const [historyHasMore, setHistoryHasMore] = useState(initial.today.historyHasMore)
  const [meals, setMeals] = useState(initial.meals)
  const [mealsHasMore, setMealsHasMore] = useState(initial.mealsHasMore)
  const [sleep, setSleep] = useState(initial.sleep)
  const [sleepHasMore, setSleepHasMore] = useState(initial.sleepHasMore)
  const [now, setNow] = useState(initial.today.now)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)

  const historyRef = useRef(initial.today.history)
  const historyMoreRef = useRef(initial.today.historyHasMore)
  const historyLoading = useRef(false)
  const mealsRef = useRef(initial.meals)
  const mealsMoreRef = useRef(initial.mealsHasMore)
  const mealsLoading = useRef(false)
  const sleepRef = useRef(initial.sleep)
  const sleepMoreRef = useRef(initial.sleepHasMore)
  const sleepLoading = useRef(false)

  const storeHistory = (next: DayTimeline[], hasMore?: boolean) => {
    historyRef.current = next
    setHistory(next)
    if (hasMore !== undefined) {
      historyMoreRef.current = hasMore
      setHistoryHasMore(hasMore)
    }
  }

  const storeMeals = (next: Meal[], hasMore?: boolean) => {
    mealsRef.current = next
    setMeals(next)
    if (hasMore !== undefined) {
      mealsMoreRef.current = hasMore
      setMealsHasMore(hasMore)
    }
  }

  const storeSleep = (next: SleepDay[], hasMore?: boolean) => {
    sleepRef.current = next
    setSleep(next)
    if (hasMore !== undefined) {
      sleepMoreRef.current = hasMore
      setSleepHasMore(hasMore)
    }
  }

  const applyHistory = (newest: DayTimeline[], hasMore: boolean) => {
    const start = newest[0]?.day
    const older = start
      ? historyRef.current.filter((day) => day.day < start)
      : []
    const byDay = new Map<string, DayTimeline>()
    for (const day of [...older, ...newest]) {
      byDay.set(day.day, day)
    }
    const merged = [...byDay.values()].sort((a, b) =>
      a.day < b.day ? -1 : a.day > b.day ? 1 : 0
    )
    storeHistory(merged, older.length === 0 ? hasMore : undefined)
  }

  const applyMeals = (newest: Meal[], hasMore: boolean) => {
    const cursor = newest[newest.length - 1]
    const seen = new Set(newest.map((meal) => meal.id))
    const older = cursor
      ? mealsRef.current.filter(
          (meal) => !seen.has(meal.id) && isOlderMeal(meal, cursor)
        )
      : []
    storeMeals([...newest, ...older], older.length === 0 ? hasMore : undefined)
  }

  const applySleep = (newest: SleepDay[], hasMore: boolean) => {
    const oldest = newest[newest.length - 1]?.date
    const seen = new Set(newest.map((day) => day.date))
    const older = oldest
      ? sleepRef.current.filter((day) => !seen.has(day.date) && day.date < oldest)
      : []
    const merged = [...newest, ...older].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0
    )
    storeSleep(merged, older.length === 0 ? hasMore : undefined)
  }

  const loadOlderHistory = useCallback(async () => {
    if (historyLoading.current || !historyMoreRef.current) {
      return
    }
    const oldest = historyRef.current[0]?.day
    if (!oldest) {
      return
    }
    historyLoading.current = true
    try {
      const end = addDays(oldest, -1)
      const response = await fetch(
        withBasePath(`/api/history?end=${encodeURIComponent(end)}&limit=100`),
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error("history")
      }
      const page = (await response.json()) as HistoryPage
      const seen = new Set(historyRef.current.map((day) => day.day))
      const fresh = page.days.filter((day) => !seen.has(day.day))
      if (fresh.length === 0) {
        storeHistory(historyRef.current, false)
        setError(false)
        return
      }
      const merged = [...fresh, ...historyRef.current].sort((a, b) =>
        a.day < b.day ? -1 : a.day > b.day ? 1 : 0
      )
      storeHistory(merged, page.hasMore)
      setError(false)
    } catch {
      setError(true)
    } finally {
      historyLoading.current = false
    }
  }, [])

  const loadOlderMeals = useCallback(async () => {
    if (mealsLoading.current || !mealsMoreRef.current) {
      return
    }
    const oldest = mealsRef.current[mealsRef.current.length - 1]
    if (!oldest) {
      return
    }
    mealsLoading.current = true
    try {
      const response = await fetch(
        withBasePath(
          `/api/meals?limit=${mealPageSize}&beforeId=${encodeURIComponent(oldest.id)}`
        ),
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error("meals")
      }
      const body = (await response.json()) as { meals: Meal[]; hasMore: boolean }
      const seen = new Set(mealsRef.current.map((meal) => meal.id))
      const fresh = body.meals.filter((meal) => !seen.has(meal.id))
      if (fresh.length === 0) {
        storeMeals(mealsRef.current, false)
        setError(false)
        return
      }
      storeMeals([...mealsRef.current, ...fresh], body.hasMore)
      setError(false)
    } catch {
      setError(true)
    } finally {
      mealsLoading.current = false
    }
  }, [])

  const loadOlderSleep = useCallback(async () => {
    if (sleepLoading.current || !sleepMoreRef.current) {
      return
    }
    const oldest = sleepRef.current[sleepRef.current.length - 1]
    if (!oldest) {
      return
    }
    sleepLoading.current = true
    try {
      const before = addDays(oldest.date, -1)
      const response = await fetch(
        withBasePath(
          `/api/sleep?before=${encodeURIComponent(before)}&limit=${sleepPageSize}`
        ),
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error("sleep")
      }
      const body = (await response.json()) as { days: SleepDay[] }
      const seen = new Set(sleepRef.current.map((day) => day.date))
      const fresh = body.days.filter((day) => !seen.has(day.date))
      if (fresh.length === 0) {
        storeSleep(sleepRef.current, false)
        setError(false)
        return
      }
      const merged = [...sleepRef.current, ...fresh].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0
      )
      storeSleep(merged, body.days.length === sleepPageSize)
      setError(false)
    } catch {
      setError(true)
    } finally {
      sleepLoading.current = false
    }
  }, [])

  const reload = useCallback(async (kind: LiveKind | "visible") => {
    const todayResponse = await fetch(withBasePath("/api/today"), {
      cache: "no-store",
    })
    if (!todayResponse.ok) {
      throw new Error("today")
    }
    const nextToday = (await todayResponse.json()) as TodayPayload
    setToday(nextToday)
    setNow(nextToday.now)
    applyHistory(nextToday.history, nextToday.historyHasMore)
    if (kind === "meal" || kind === "visible") {
      const response = await fetch(
        withBasePath(
          `/api/meals?before=${encodeURIComponent(nextToday.day)}&limit=${mealPageSize}`
        ),
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error("meals")
      }
      const body = (await response.json()) as { meals: Meal[]; hasMore: boolean }
      applyMeals(body.meals, body.hasMore)
    }
    if (kind === "sleep" || kind === "visible") {
      const response = await fetch(
        withBasePath(
          `/api/sleep?before=${encodeURIComponent(nextToday.day)}&limit=${sleepPageSize}`
        ),
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error("sleep")
      }
      const body = (await response.json()) as { days: SleepDay[] }
      applySleep(body.days, body.days.length === sleepPageSize)
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
    let timer = 0
    let stopped = false
    const arm = () => {
      if (stopped) {
        return
      }
      const current = dayKey(new Date(), today.timezone)
      if (current !== today.day) {
        void reload("visible")
          .then(() => {
            if (!stopped) {
              setError(false)
            }
          })
          .catch(() => {
            if (!stopped) {
              setError(true)
            }
          })
          .finally(() => {
            if (!stopped) {
              timer = window.setTimeout(arm, 30_000)
            }
          })
        return
      }
      const nextMidnight = zonedMidnight(
        addDays(current, 1),
        today.timezone
      ).getTime()
      timer = window.setTimeout(
        arm,
        Math.max(1000, nextMidnight - Date.now() + 250)
      )
    }
    arm()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [reload, today.day, today.timezone])

  useEffect(() => {
    let source: EventSource | null = null
    let timer: number | null = null
    let stopped = false

    const connect = () => {
      source = new EventSource(withBasePath("/api/live"))
      source.addEventListener("update", (event) => {
        try {
          const data = JSON.parse(String((event as MessageEvent).data)) as {
            kind?: string
          }
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
            {pending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : null}
            Retry
          </Button>
        </div>
      ) : null}
      <TodayPanel
        today={today}
        history={history}
        historyHasMore={historyHasMore}
        onNeedOlder={() => {
          void loadOlderHistory()
        }}
        now={now}
      />
      <MealStrip
        meals={meals}
        timeZone={today.timezone}
        today={today.day}
        onNearStart={() => {
          void loadOlderMeals()
        }}
        preserveKey={meals[meals.length - 1]?.id}
      />
      <SleepPanel
        days={sleep}
        timeZone={today.timezone}
        today={today.day}
        hasMore={sleepHasMore}
        onNeedOlder={() => {
          void loadOlderSleep()
        }}
      />
    </div>
  )
}

function slotRank(slot: Meal["slot"]): number {
  if (slot === "dinner") {
    return 0
  }
  if (slot === "lunch") {
    return 1
  }
  return 2
}

function isOlderMeal(meal: Meal, cursor: Meal): boolean {
  if (meal.day !== cursor.day) {
    return meal.day < cursor.day
  }
  const rank = slotRank(meal.slot) - slotRank(cursor.slot)
  if (rank !== 0) {
    return rank > 0
  }
  if (meal.eatenAt !== cursor.eatenAt) {
    return meal.eatenAt < cursor.eatenAt
  }
  return meal.id < cursor.id
}
