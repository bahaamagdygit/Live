import React from 'react'
import { createRoot } from 'react-dom/client'
import PresentationApp from './PresentationApp'
import './presentation.css'

const root = document.getElementById('presentation-root')!
createRoot(root).render(
  <React.StrictMode>
    <PresentationApp />
  </React.StrictMode>
)
