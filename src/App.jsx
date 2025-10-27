"use client"

import React from "react"
import { useState, useEffect } from "react"
import VehicleMap from "./VehicleMap"
import Controls from "./components/Controls"
import "./App.css"

function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [routeData, setRouteData] = useState([])
  const [loading, setLoading] = useState(true)
  const [animationTime, setAnimationTime] = useState(0)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [currentStop, setCurrentStop] = useState(1)

  // Fetch route data on mount
  useEffect(() => {
    fetch("/dummy-route.json")
      .then((res) => res.json())
      .then((data) => {
        setRouteData(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Error loading route data:", err)
        setLoading(false)
      })
  }, [])

  // Compute totalSeconds from routeData
  useEffect(() => {
    if (routeData.length < 2) return

    const legDurs = []
    for (let i = 0; i < routeData.length - 1; i++) {
      const t1 = new Date(routeData[i].timestamp).getTime()
      const t2 = new Date(routeData[i + 1].timestamp).getTime()
      legDurs.push((t2 - t1) / 1000)
    }
    const totSec = legDurs.reduce((a, b) => a + b, 0)
    setTotalSeconds(totSec)
  }, [routeData])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleReset = () => {
    setIsPlaying(false)
    setCurrentIndex(0)
    setAnimationTime(0)
    setCurrentStop(1)
  }

  const handleSpeedChange = (speed) => {
    // Speed will be handled in VehicleMap component
    return speed
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Vehicle Tracker</h1>
        <p>Real-time vehicle movement simulation</p>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading">Loading route data...</div>
        ) : (
          <>
            <VehicleMap
              routeData={routeData}
              isPlaying={isPlaying}
              currentIndex={currentIndex}
              setCurrentIndex={setCurrentIndex}
              animationTime={animationTime}
              setAnimationTime={setAnimationTime}
              totalSeconds={totalSeconds}
              currentStop={currentStop}
              setCurrentStop={setCurrentStop}
            />
            <Controls
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              animationTime={animationTime}
              totalSeconds={totalSeconds}
              routeData={routeData}
              currentStop={currentStop}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App