// src/lib/types.ts

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
  type: string;
  color?: string;
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

// --- AÑADIR ESTA INTERFAZ ---
// Define la estructura de las preferencias del usuario (RF05)
export interface Preferences {
  theme: 'dark' | 'light' | 'ocean'; // Temas visuales
  detail_level: 'simple' | 'detailed'; // Nivel de detalle
  persona_type: 'estudiante' | 'profesor' | 'investigador'; // User Persona
}