"use client"

import { useState, useEffect } from "react"

function toRad(value) {
  return (value * Math.PI) / 180
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Radius of the earth in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const d = R * c
  return d
}

function Controls({ isPlaying, onPlayPause, onReset, animationTime, totalSeconds, routeData, currentStop }) {
  const [currentSpeed, setCurrentSpeed] = useState(0)

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Calculate average speed for current leg
  useEffect(() => {
    if (!routeData || routeData.length === 0) {
      setCurrentSpeed(0)
      return
    }

    const totalStops = routeData.length
    let currentLeg = currentStop - 1 // Current leg being traveled (0-based)
    if (currentLeg >= totalStops - 1) {
      currentLeg = totalStops - 2 // Last leg
    }
    if (currentLeg < 0) {
      currentLeg = 0
    }

    const startP = routeData[currentLeg]
    const endP = routeData[currentLeg + 1]
    if (!startP || !endP) {
      setCurrentSpeed(0)
      return
    }

    const timeDiff = (new Date(endP.timestamp).getTime() - new Date(startP.timestamp).getTime()) / 1000
    const distance = calculateDistance(startP.latitude, startP.longitude, endP.latitude, endP.longitude)
    const speed = timeDiff > 0 ? (distance / timeDiff) * 3.6 : 0 // km/h
    setCurrentSpeed(speed.toFixed(2))
  }, [currentStop, routeData])

  const totalPoints = routeData ? routeData.length : 0
  const progress = totalSeconds > 0 ? (animationTime / totalSeconds) * 100 : 0
  const currentPoint = routeData && currentStop > 0 && currentStop <= totalPoints ? routeData[currentStop - 1] : null

  return (
    <div className="controls-container">
      <div className="controls-panel">
        <div className="button-group">
          <button onClick={onPlayPause} className={`btn ${isPlaying ? "btn-pause" : "btn-play"}`}>
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={onReset} className="btn btn-reset">
            ↻ Reset
          </button>
        </div>

        <div className="metadata">
          <div className="metadata-item">
            <span className="label">Position:</span>
            <span className="value">
              {currentPoint ? `${currentPoint.latitude.toFixed(6)}, ${currentPoint.longitude.toFixed(6)}` : "N/A"}
            </span>
          </div>
          <div className="metadata-item">
            <span className="label">Elapsed Time:</span>
            <span className="value">{formatTime(animationTime)}</span>
          </div>
          <div className="metadata-item">
            <span className="label">Speed:</span>
            <span className="value">{currentSpeed} km/h</span>
          </div>
          <div className="metadata-item">
            <span className="label">Progress:</span>
            <span className="value">
              {currentStop} / {totalPoints}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Controls