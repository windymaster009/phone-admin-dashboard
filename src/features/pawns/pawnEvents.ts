import type { Pawn } from '../../types/domain'

export const PAWN_CREATED_EVENT = 'phoneflow:pawn-created'

export type PawnCreatedEventDetail = {
  pawn: Pawn
}

export function notifyPawnCreated(pawn: Pawn) {
  window.dispatchEvent(new CustomEvent<PawnCreatedEventDetail>(PAWN_CREATED_EVENT, {
    detail: { pawn },
  }))
}
