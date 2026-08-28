import { useEffect } from 'react'
import { useHierarchyStore } from '../store/hierarchyStore'
import { fetchPlants, fetchSheds, fetchSections, fetchMachines } from '../api/hierarchy'

/**
 * Single hook that drives the Plant→Shed→Section→Machine cascade.
 *
 * Design:
 *  - Plants are fetched once globally (guarded by Zustand state, not a ref,
 *    so it survives component remounts)
 *  - AbortController on every fetch → no stale-data race conditions
 *  - Each level clears its children before fetching new data
 */
export function useHierarchy() {
  const store = useHierarchyStore()
  const {
    plants,
    selectedPlantId,
    selectedShedId,
    selectedSectionId,
    setPlants,
    setSheds,
    setSections,
    setMachines,
    setLoadingSheds,
    setLoadingSections,
    setLoadingMachines,
    selectPlant,
  } = store

  // ── Plants — fetch once, guarded by whether plants array is already populated ──
  useEffect(() => {
    // If the Zustand store already has plants (e.g., navigated back to this page),
    // don't re-fetch. This also handles the Sidebar already having loaded plants.
    if (plants.length > 0) {
      // Ensure first plant is selected if nothing is selected
      if (!useHierarchyStore.getState().selectedPlantId) {
        selectPlant(plants[0].id)
      }
      return
    }

    const ctrl = new AbortController()
    fetchPlants().then((data) => {
      if (ctrl.signal.aborted) return
      setPlants(data)
      if (data.length > 0 && !useHierarchyStore.getState().selectedPlantId) {
        selectPlant(data[0].id)
      }
    }).catch((e) => { if (!ctrl.signal.aborted) console.error('fetchPlants', e) })
    return () => ctrl.abort()
  }, [plants.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sheds — cascade from plant ──────────────────────────────────────
  useEffect(() => {
    if (!selectedPlantId) return
    const ctrl = new AbortController()
    setLoadingSheds(true)
    fetchSheds(selectedPlantId).then((data) => {
      if (ctrl.signal.aborted) return
      setSheds(data)
    }).catch((e) => { if (!ctrl.signal.aborted) console.error('fetchSheds', e) })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingSheds(false) })
    return () => { ctrl.abort(); setLoadingSheds(false) }
  }, [selectedPlantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sections — cascade from shed ────────────────────────────────────
  useEffect(() => {
    if (!selectedShedId) { setSections([]); return }
    const ctrl = new AbortController()
    setLoadingSections(true)
    setSections([]) // clear immediately — prevents showing previous shed's sections
    fetchSections(selectedShedId).then((data) => {
      if (ctrl.signal.aborted) return
      setSections(data)
    }).catch((e) => { if (!ctrl.signal.aborted) console.error('fetchSections', e) })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingSections(false) })
    return () => { ctrl.abort(); setLoadingSections(false) }
  }, [selectedShedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Machines — cascade from section ─────────────────────────────────
  useEffect(() => {
    if (!selectedSectionId) { setMachines([]); return }
    const ctrl = new AbortController()
    setLoadingMachines(true)
    setMachines([])
    fetchMachines({ section_id: selectedSectionId }).then((data) => {
      if (ctrl.signal.aborted) return
      setMachines(data)
    }).catch((e) => { if (!ctrl.signal.aborted) console.error('fetchMachines', e) })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingMachines(false) })
    return () => { ctrl.abort(); setLoadingMachines(false) }
  }, [selectedSectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  return store
}
