import React from 'react'
import { createRoot } from 'react-dom/client'
import PptxControllerApp from './PptxControllerApp'
import './controller.css'

const root = document.getElementById('pptx-controller-root')!
createRoot(root).render(
  <React.StrictMode>
    <PptxControllerApp />
  </React.StrictMode>
)
