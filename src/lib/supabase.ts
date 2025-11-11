// src/lib/types.ts
import { createClient } from '@supabase/supabase-js';

// --- Exportar tipos aquí también es válido si quieres un solo módulo de 'datos' ---

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('¡Error! Faltan las variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en tu archivo .env');
}

// Exporta el cliente de Supabase que AuthContext necesita
export const supabase = createClient(supabaseUrl, supabaseAnonKey);


// Interfaz para la lista de grafos (del historial)
export interface GraphSummary {
  id: string;
  title: string;
}

// Interfaces para los datos del grafo (de app.py)
export interface Node {
  id: string;
  label: string;
  description?: string;
  type: string; // 'entity' o 'concept' de app.py
  comments?: Array<{
    user_id: string;
    text: string;
    timestamp: string;
  }>;
}

export interface Edge {
  from: string; // ID del nodo origen
  to: string; // ID del nodo destino
  label: string; // Descripción de la relación
}

// Interfaz para el objeto de grafo completo
export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  summary?: string;
}