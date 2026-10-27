import { PageFrame } from "@/components/page-frame"
import { StatusBoard } from "@/components/status-board"
import { listMeals } from "@/lib/meals"
import { listSleep } from "@/lib/sleep"
import { loadToday } from "@/lib/today"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default async function Page() {
  const today = await loadToday()
  const meals = listMeals(today.day, 60)
  const sleep = listSleep(today.day, 400)
  return (
    <PageFrame>
      <StatusBoard initial={{ today, meals, sleep }} />
    </PageFrame>
  )
}
