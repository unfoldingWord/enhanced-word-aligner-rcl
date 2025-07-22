import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import WordAlignerComponent from './WordAlignerComponent.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WordAlignerComponent />
  </StrictMode>,
)
