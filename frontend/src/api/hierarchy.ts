import api from './client'
import type { Plant, Shed, Section, Machine } from '../types'

export const fetchPlants = () =>
  api.get<Plant[]>('/plants').then((r) => r.data)

export const fetchSheds = (plantId?: number) =>
  api.get<Shed[]>('/sheds', { params: plantId ? { plant_id: plantId } : {} }).then((r) => r.data)

export const fetchSections = (shedId?: number, plantId?: number) =>
  api.get<Section[]>('/sections', {
    params: { ...(shedId ? { shed_id: shedId } : {}), ...(plantId ? { plant_id: plantId } : {}) },
  }).then((r) => r.data)

export const fetchMachines = (params: {
  section_id?: number
  shed_id?: number
  plant_id?: number
}) => api.get<Machine[]>('/machines', { params }).then((r) => r.data)

import type { EnergyMeter } from '../types'

export const fetchMeters = (params: {
  plant_id?: number
  shed_id?: number
  section_id?: number
  machine_id?: number
}) => api.get<EnergyMeter[]>('/meters', { params }).then((r) => r.data)
