import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ConfirmProvider } from './lib/confirm'
import App from './App'
import './styles.css'

// old bookmarks used #/path — send them to the clean URL
if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1) === '/' ? '/home' : location.hash.slice(1))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
