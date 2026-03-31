import React from 'react'
import { createRoot } from 'react-dom/client'
import PresentationApp from './PresentationApp'
import './presentation.css'
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/900.css'
import '@fontsource/tajawal/400.css'
import '@fontsource/tajawal/700.css'
import '@fontsource/tajawal/800.css'
import '@fontsource/lalezar/400.css'
import '@fontsource/reem-kufi/400.css'
import '@fontsource/reem-kufi/700.css'
import '@fontsource/noto-kufi-arabic/400.css'
import '@fontsource/noto-kufi-arabic/700.css'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'

const root = document.getElementById('presentation-root')!
createRoot(root).render(
  <React.StrictMode>
    <PresentationApp />
  </React.StrictMode>
)
