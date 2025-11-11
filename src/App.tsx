// src/App.tsx
import { GraphDashboard } from './components/GraphDashboard';
import { Auth } from './components/Auth'; // <-- Importa Auth real
import { useAuth } from './contexts/AuthContext'; // <-- Importa el hook

function App() {
  const { user, signOut } = useAuth(); // <-- Usa el contexto

  return user ? (
    <GraphDashboard 
      userEmail={user.email || 'Usuario'} 
      onLogout={signOut} 
    />
  ) : (
    <Auth /> // <-- Usa el componente Auth real
  );
}

export default App;