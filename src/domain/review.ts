import { createEmptyCard, fsrs, type Grade } from 'ts-fsrs'
import type { ReviewOperation } from './model'

export function nextDueAt(entryId: string, reviews: ReviewOperation[]): Date | null {
  const attempts = reviews.filter((event) => event.entryId === entryId)
  if (!attempts.length) return null
  const scheduler = fsrs()
  let card = createEmptyCard(new Date(attempts[0].at))
  for (const event of attempts) {
    card = scheduler.next(card, new Date(event.at), event.rating as Grade).card
  }
  return card.due
}

export function isDue(entryId: string, reviews: ReviewOperation[], now = new Date()): boolean {
  const due = nextDueAt(entryId, reviews)
  return due === null || due <= now
}
