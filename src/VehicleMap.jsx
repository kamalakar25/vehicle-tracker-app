"use client"

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

// ✅ Fix Leaflet marker default icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
})

function toRad(value) {
  return (value * Math.PI) / 180
}

function toDeg(value) {
  return (value * 180) / Math.PI
}

function calculateBearing(startLat, startLng, endLat, endLng) {
  const dLng = toRad(endLng - startLng)
  const y = Math.sin(dLng) * Math.cos(toRad(endLat))
  const x =
    Math.cos(toRad(startLat)) * Math.sin(toRad(endLat)) -
    Math.sin(toRad(startLat)) * Math.cos(toRad(endLat)) * Math.cos(dLng)
  let bearing = toDeg(Math.atan2(y, x))
  return (bearing + 360) % 360
}

function VehicleMap({ 
  routeData, 
  isPlaying, 
  currentIndex, 
  setCurrentIndex,
  animationTime,
  setAnimationTime,
  totalSeconds,
  currentStop,
  setCurrentStop 
}) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const traveledPolylineRef = useRef(null)
  const stopMarkersRef = useRef([])
  const rafRef = useRef(null)
  const prevTimeRef = useRef(null)
  const prevFloorRef = useRef(0)
  const prevStopRef = useRef(-1)
  const [speed, setSpeed] = useState(1)
  const [roadRoute, setRoadRoute] = useState([])
  const [legGeometries, setLegGeometries] = useState([])
  const [cumLegStarts, setCumLegStarts] = useState([])
  const [legDurations, setLegDurations] = useState([])

  // ✅ Create rotatable vehicle icon (place image.png in /public folder)
  const createVehicleIcon = (rotation = 0) =>
    L.divIcon({
      html: `<img src="/image.png" alt="Vehicle" style="width: 38px; height: 38px; transform: rotate(${rotation}deg); transform-origin: center;" />`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      className: "custom-div-icon",
    })

  // ✅ Reset animation when route changes
  useEffect(() => {
    if (roadRoute.length > 0) {
      setAnimationTime(0)
      prevFloorRef.current = 0
      prevStopRef.current = -1
      setCurrentStop(1)
    }
  }, [roadRoute, setAnimationTime, setCurrentStop])

  // ✅ Sync animation time from parent currentIndex when paused
  useEffect(() => {
    if (!isPlaying && totalSeconds > 0 && roadRoute.length > 0) {
      const approxProgress = currentIndex / (roadRoute.length - 1)
      const approxTime = approxProgress * totalSeconds
      setAnimationTime(approxTime)
      const approxStopIdx = Math.floor(approxProgress * (routeData.length - 1))
      prevStopRef.current = approxStopIdx
      setCurrentStop(approxStopIdx + 1)
    }
  }, [currentIndex, isPlaying, totalSeconds, roadRoute.length, routeData.length, setAnimationTime, setCurrentStop])

  // ✅ Fetch snapped-to-road routes for each leg using alternative public OSRM instance
  useEffect(() => {
    async function fetchRoadRoutes() {
      if (routeData.length < 2) return

      const legDurs = []
      for (let i = 0; i < routeData.length - 1; i++) {
        const t1 = new Date(routeData[i].timestamp).getTime()
        const t2 = new Date(routeData[i + 1].timestamp).getTime()
        legDurs.push((t2 - t1) / 1000)
      }
      setLegDurations(legDurs)

      // Fetch each leg route with fallback
      const promises = []
      for (let i = 0; i < routeData.length - 1; i++) {
        const start = `${routeData[i].longitude},${routeData[i].latitude}`
        const end = `${routeData[i + 1].longitude},${routeData[i + 1].latitude}`
        const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${start};${end}?overview=full&geometries=geojson`
        const straightCoords = [
          { latitude: routeData[i].latitude, longitude: routeData[i].longitude },
          { latitude: routeData[i + 1].latitude, longitude: routeData[i + 1].longitude }
        ]
        promises.push(
          (async (legIndex) => {
            try {
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 5000)
              const res = await fetch(url, { signal: controller.signal })
              clearTimeout(timeoutId)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const data = await res.json()
              if (data.routes && data.routes[0]) {
                return data.routes[0].geometry.coordinates.map(([lon, lat]) => ({
                  latitude: lat,
                  longitude: lon,
                }))
              } else {
                console.warn(`No route data for leg ${legIndex}, using straight line`)
                return straightCoords
              }
            } catch (err) {
              if (err.name === 'AbortError') {
                console.warn(`Timeout for leg ${legIndex}, using straight line`)
              } else {
                console.error(`Failed to fetch leg ${legIndex}:`, err)
              }
              return straightCoords
            }
          })(i)
        )
      }

      try {
        const legGeoms = await Promise.all(promises)
        setLegGeometries(legGeoms)

        // Build full roadRoute and cumulative leg starts
        const rr = []
        const cls = [0]
        let cs = 0
        legGeoms.forEach((coords) => {
          rr.push(...coords)
          cs += coords.length
          cls.push(cs)
        })
        setRoadRoute(rr)
        setCumLegStarts(cls)
      } catch (err) {
        console.error("Failed to process routes:", err)
        // Fallback: build straight route
        const straightRr = []
        const straightCls = [0]
        let straightCs = 0
        for (let i = 0; i < routeData.length - 1; i++) {
          const legStraight = [
            { latitude: routeData[i].latitude, longitude: routeData[i].longitude },
            { latitude: routeData[i + 1].latitude, longitude: routeData[i + 1].longitude }
          ]
          straightRr.push(...legStraight)
          straightCs += legStraight.length
          straightCls.push(straightCs)
        }
        setLegGeometries(Array(routeData.length - 1).fill().map((_, i) => [
          { latitude: routeData[i].latitude, longitude: routeData[i].longitude },
          { latitude: routeData[i + 1].latitude, longitude: routeData[i + 1].longitude }
        ]))
        setRoadRoute(straightRr)
        setCumLegStarts(straightCls)
      }
    }

    fetchRoadRoutes()
  }, [routeData])

  // ✅ Add stop markers
  useEffect(() => {
    if (!mapInstanceRef.current || routeData.length === 0) return

    // Clear previous markers
    stopMarkersRef.current.forEach((m) => {
      if (mapInstanceRef.current) mapInstanceRef.current.removeLayer(m)
    })
    stopMarkersRef.current = []

    const markers = routeData.map((point, index) => {
      const label = index + 1
      const html = `<div style="background-color: #ff6b6b; color: white; border-radius: 50%; width: 24px; height: 24px; line-height: 24px; text-align: center; font-weight: bold; font-size: 12px;">${label}</div>`
      const stopIcon = L.divIcon({
        html,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      const popupContent = `<b>Stop ${index + 1}</b><br/>Time: ${point.timestamp}`
      const marker = L.marker([point.latitude, point.longitude], { icon: stopIcon })
        .bindPopup(popupContent)
        .addTo(mapInstanceRef.current)
      return marker
    })

    stopMarkersRef.current = markers
  }, [routeData])

  // ✅ Initialize map and marker
  useEffect(() => {
    if (!mapRef.current || roadRoute.length === 0) return

    if (!mapInstanceRef.current) {
      const firstPoint = roadRoute[0]
      mapInstanceRef.current = L.map(mapRef.current).setView([firstPoint.latitude, firstPoint.longitude], 15)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(mapInstanceRef.current)

      // ✅ Add vehicle marker with initial icon (0° rotation)
      markerRef.current = L.marker([firstPoint.latitude, firstPoint.longitude], {
        icon: createVehicleIcon(0),
        title: "Vehicle",
      })
        .addTo(mapInstanceRef.current)
        .bindPopup("🚗 Vehicle is moving")

      // ✅ Draw full planned route (dashed gray)
      const fullRouteCoords = roadRoute.map((p) => [p.latitude, p.longitude])
      L.polyline(fullRouteCoords, {
        color: "#9ca3af",
        weight: 2,
        dashArray: "5, 5",
        opacity: 0.5,
      }).addTo(mapInstanceRef.current)

      // ✅ Draw traveled route (initially empty, solid blue)
      traveledPolylineRef.current = L.polyline([], {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.7,
      }).addTo(mapInstanceRef.current)

      mapInstanceRef.current.fitBounds(L.latLngBounds(fullRouteCoords))
    }
  }, [roadRoute])

  // ✅ Smooth time-based animation using requestAnimationFrame
  useEffect(() => {
    if (totalSeconds <= 0 || roadRoute.length < 2) return

    const animate = (currentTime) => {
      if (!isPlaying) return

      const deltaTime = prevTimeRef.current ? currentTime - prevTimeRef.current : 0
      prevTimeRef.current = currentTime

      const increment = (deltaTime / 1000.0) * speed

      setAnimationTime((prevTime) => Math.min(prevTime + increment, totalSeconds))

      rafRef.current = requestAnimationFrame(animate)
    }

    if (isPlaying) {
      prevTimeRef.current = null
      rafRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      prevTimeRef.current = null
    }
  }, [isPlaying, speed, totalSeconds, setAnimationTime])

  // ✅ Sync discrete currentIndex to parent
  useEffect(() => {
    if (roadRoute.length === 0 || totalSeconds === 0) return

    const approxProgress = animationTime / totalSeconds
    const approxIdx = approxProgress * (roadRoute.length - 1)
    const floor = Math.floor(approxIdx)
    if (floor !== prevFloorRef.current) {
      setCurrentIndex(floor)
      prevFloorRef.current = floor
    }
  }, [animationTime, roadRoute.length, totalSeconds, setCurrentIndex])

  // ✅ Update vehicle position, rotation, traveled route, and stop popup with time-based interpolation
  useEffect(() => {
    if (roadRoute.length < 2 || !markerRef.current || totalSeconds === 0 || legGeometries.length === 0 || legDurations.length === 0) return

    const progress = animationTime / totalSeconds
    let stopIdx = Math.floor(progress * (routeData.length - 1))
    setCurrentStop(stopIdx + 1)

    // Update stop popup if new stop reached
    if (stopIdx !== prevStopRef.current) {
      if (prevStopRef.current >= 0 && stopMarkersRef.current[prevStopRef.current]) {
        stopMarkersRef.current[prevStopRef.current].closePopup()
      }
      if (stopIdx < stopMarkersRef.current.length && stopMarkersRef.current[stopIdx]) {
        stopMarkersRef.current[stopIdx].openPopup()
      }
      prevStopRef.current = stopIdx
    }

    if (animationTime >= totalSeconds) {
      // At end
      const lastPoint = roadRoute[roadRoute.length - 1]
      markerRef.current.setLatLng([lastPoint.latitude, lastPoint.longitude])
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo([lastPoint.latitude, lastPoint.longitude], { animate: true, duration: 0.1 })
      }
      if (traveledPolylineRef.current) {
        const traveledCoords = roadRoute.map((pt) => [pt.latitude, pt.longitude])
        traveledPolylineRef.current.setLatLngs(traveledCoords)
      }
      // Set bearing to last segment
      if (roadRoute.length > 1) {
        const prevP = roadRoute[roadRoute.length - 2]
        const lastP = lastPoint
        const bearing = calculateBearing(prevP.latitude, prevP.longitude, lastP.latitude, lastP.longitude)
        const newIcon = createVehicleIcon(bearing)
        markerRef.current.setIcon(newIcon)
      }
      return
    }

    // Find current leg
    let leg = 0
    let cumTime = 0
    for (let i = 0; i < legDurations.length; i++) {
      cumTime += legDurations[i]
      if (animationTime <= cumTime) {
        leg = i
        break
      }
    }
    const legStartTime = cumTime - legDurations[leg]
    const legDuration = legDurations[leg]
    const frac = (animationTime - legStartTime) / legDuration
    const legRoute = legGeometries[leg] || []
    const legLen = legRoute.length
    if (legLen < 2) return // Invalid leg

    const targetSubIdx = frac * (legLen - 1)
    let subFloor, subFrac, pos, bearing
    if (targetSubIdx >= legLen - 1) {
      subFloor = legLen - 2
      subFrac = 1
      pos = legRoute[legLen - 1]
      bearing = calculateBearing(legRoute[legLen - 2].latitude, legRoute[legLen - 2].longitude, pos.latitude, pos.longitude)
    } else {
      subFloor = Math.floor(targetSubIdx)
      subFrac = targetSubIdx - subFloor
      const startP = legRoute[subFloor]
      const endP = legRoute[subFloor + 1]
      const lat = startP.latitude + subFrac * (endP.latitude - startP.latitude)
      const lng = startP.longitude + subFrac * (endP.longitude - startP.longitude)
      pos = { latitude: lat, longitude: lng }
      bearing = calculateBearing(startP.latitude, startP.longitude, endP.latitude, endP.longitude)
    }

    // Update marker position and rotation
    markerRef.current.setLatLng([pos.latitude, pos.longitude])
    const newIcon = createVehicleIcon(bearing)
    markerRef.current.setIcon(newIcon)

    // Pan to position
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo([pos.latitude, pos.longitude], { animate: true, duration: 0.1 })
    }

    // Update traveled polyline
    if (traveledPolylineRef.current) {
      const baseEndIdx = cumLegStarts[leg] + subFloor + 1
      let traveledCoords = roadRoute.slice(0, baseEndIdx).map((pt) => [pt.latitude, pt.longitude])
      if (subFrac > 0 && subFrac < 1) {
        traveledCoords.push([pos.latitude, pos.longitude])
      }
      traveledPolylineRef.current.setLatLngs(traveledCoords)
    }
  }, [animationTime, roadRoute, legGeometries, cumLegStarts, legDurations, totalSeconds, routeData, setCurrentStop, isPlaying])

  return (
    <div className="vehicle-map-container">
      <div ref={mapRef} className="map" />
      <div className="controls">
        <div className="speed-control">
          <label htmlFor="speed-slider">Speed: </label>
          <input
            id="speed-slider"
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="slider"
          />
          <span>{speed}x</span>
        </div>
      </div>
    </div>
  )
}

export default VehicleMap