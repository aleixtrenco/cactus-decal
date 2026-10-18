import '@fontsource/saira/400.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/600.css'
import '@fontsource/saira/700.css'
import '@fontsource/saira/800.css'
import '@fontsource/saira-extra-condensed/800.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
