// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// No importar 'AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Quitar el <AuthProvider> */}
    <App />
  </StrictMode>
);