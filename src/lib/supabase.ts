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