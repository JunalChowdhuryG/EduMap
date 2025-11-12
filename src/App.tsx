// src/App.tsx
import { useState } from 'react';
import { GraphDashboard } from './components/GraphDashboard';
import { Login } from './components/Login'; // Importar el componente de login simple

function App() {
  // Estado para guardar el email del usuario (simulado)
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Función que se pasará a Login para actualizar el estado
  const handleLogin = (email: string) => {
    setUserEmail(email);
  };

  // Función para simular el logout
  const handleLogout = () => {
    setUserEmail(null);
    // Limpiar el user_id temporal al salir
    sessionStorage.removeItem('knowledge_graph_user_id');
  };

  // Renderiza Login o GraphDashboard basado en si hay un email
  return userEmail ? (
    <GraphDashboard userEmail={userEmail} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}

export default App;