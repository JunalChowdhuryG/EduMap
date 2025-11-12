// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// --- Lógica de Cliente de Supabase ---

// NOTA: Estas variables deben estar en tu archivo .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Solo lanzamos una advertencia, ya que no es crítico para el login
  console.warn('Variables de Supabase no configuradas. AuthContext (si se usa) fallará.');
}

// Exporta el cliente de Supabase (aunque no lo usemos para login,
// AuthContext.tsx todavía lo importa y causa el error)
export const supabase = createClient(supabaseUrl || "YOUR_URL", supabaseAnonKey || "YOUR_KEY");