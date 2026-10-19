// Where the plastics really show on each bike's 3D model (see RealBike), kept
// per bike so the template and the print file place the number and lettering
// exactly where the 3D preview does.

import { create } from 'zustand'
import type { SeenArea } from './graphics'

interface SeenStore {
  byBike: Record<string, SeenArea>
  put: (bikeId: string, seen: SeenArea) => void
}

export const useSeen = create<SeenStore>((set) => ({
  byBike: {},
  put: (bikeId, seen) => set((s) => (s.byBike[bikeId]?.id === seen.id ? s : { byBike: { ...s.byBike, [bikeId]: seen } })),
}))

export const seenFor = (bikeId: string) => useSeen.getState().byBike[bikeId]
