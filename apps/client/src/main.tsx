import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { extend } from '@pixi/react'
import { Container, Sprite, Graphics, Text } from 'pixi.js'
import './index.css'
import App from './App.tsx'

extend({ Container, Sprite, Graphics, Text })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
