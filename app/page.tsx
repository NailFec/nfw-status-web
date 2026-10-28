import { PageFrame } from "@/components/page-frame"
import { StatusBoard } from "@/components/status-board"
import { listMeals } from "@/lib/meals"
import { listSleep } from "@/lib/sleep"
import { loadToday } from "@/lib/today"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const mealPageSize = 30
const sleepPageSize = 100

export default async function Page() {
  const today = await loadToday()
  const mealPage = await listMeals(today.day, mealPageSize)
  const sleep = listSleep(today.day, sleepPageSize)
  return (
    <PageFrame>
      <StatusBoard
        initial={{
          today,
          meals: mealPage.meals,
          mealsHasMore: mealPage.hasMore,
          sleep,
          sleepHasMore: sleep.length === sleepPageSize,
        }}
      />
    </PageFrame>
  )
}
