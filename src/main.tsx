import '@fontsource/saira/400.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/600.css'
import '@fontsource/saira/700.css'
import '@fontsource/saira/800.css'
import '@fontsource/saira-extra-condensed/800.css'
import '@fontsource/racing-sans-one/latin-400.css'
import '@fontsource/russo-one/latin-400.css'
import '@fontsource/black-ops-one/latin-400.css'
import '@fontsource/teko/latin-700.css'
import '@fontsource/orbitron/latin-800.css'
import '@fontsource/bungee/latin-400.css'
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/michroma/latin-400.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Last line of defence: if something fails outside the page's own error
// handling, say so on screen (with the message to send us) instead of
// leaving a blank or black page.
function crashNote(message: string) {
  if (document.querySelector('.crash-note')) return
  const box = document.createElement('div')
  box.className = 'crash-note'
  box.setAttribute('role', 'alert')
  const title = document.createElement('b')
  title.textContent = 'Something went wrong on this page.'
  const code = document.createElement('code')
  code.textContent = `${message}\n${navigator.userAgent}`
  const reload = document.createElement('button')
  reload.textContent = 'Reload'
  reload.onclick = () => location.reload()
  const close = document.createElement('button')
  close.textContent = 'Dismiss'
  close.onclick = () => box.remove()
  box.append(title, 'Please send us a screenshot of this message.', code, reload, close)
  document.body.append(box)
}
const ignore = /ResizeObserver loop|Script error\.?$/
window.addEventListener('error', (e) => e.message && !ignore.test(e.message) && crashNote(e.message))
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  if (!ignore.test(msg)) crashNote(msg)
})

createRoot(document.getElementById('root')!, {
  // A crash that escapes every error boundary unmounts the app.
  onUncaughtError: (error) => crashNote(error instanceof Error ? error.message : String(error)),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
