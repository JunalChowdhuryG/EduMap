// src/lib/api.ts
import { GraphSummary, GraphData, Node } from './types';

// Asume que tu backend FastAPI corre en el puerto 8000
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'Error en la solicitud a la API');
  }
  return response.json();
}

// Auth (RF05)
export const createUser = (requestData: { user_id?: string } = {}): Promise<{ user_id: string }> => {
  return fetchApi('/create_user', {
    method: 'POST',
    body: JSON.stringify({ requestData }),
  });
};

// Graph History (RF05)
export const getGraphHistory = (user_id: string): Promise<{ graphs: GraphSummary[] }> => {
  if (!user_id) return Promise.resolve({ graphs: [] }); // Evitar llamar con null
  return fetchApi(`/graph_history/${user_id}`);
};

// Graph Data (CU-01)
export const getGraph = (user_id: string, graph_id: string): Promise<{ graph: GraphData }> => {
   if (!user_id || !graph_id) return Promise.reject("User ID y Graph ID son requeridos"); // Evitar llamadas inválidas
  return fetchApi(`/get_graph/${user_id}/${graph_id}`); // Ruta actualizada
};

// Generate/Refine (RF01, RF04, CU-01)
export const generateGraph = (
  message: string,
  user_id: string,
  title: string,
  previous_graph: GraphData | null = null
): Promise<{ graph_id: string; graph: GraphData }> => {
  return fetchApi('/generate_graph', {
    method: 'POST',
    body: JSON.stringify({
      message,
      user_id,
      title,
      previous_graph,
    }),
  });
};

// Refine (RF04, CU-02)
export const refineGraph = (
  feedback: string,
  graph_id: string,
  user_id: string
): Promise<{ graph_id: string; graph: GraphData }> => {
  return fetchApi('/refine_graph', {
    method: 'POST',
    body: JSON.stringify({ feedback, graph_id, user_id }),
  });
};

// Expand (RF03, CU-02)
export const expandNode = (
  message: string,
  graph_id: string,
  user_id: string,
  previous_graph: GraphData
): Promise<{ graph_id: string; graph: GraphData }> => {
  return fetchApi('/expand_node', {
    method: 'POST',
    body: JSON.stringify({
      message,
      graph_id,
      user_id,
      previous_graph,
    }),
  });
};

// Multimodal Upload (RF08)
export const uploadFile = async (file: File): Promise<{ extracted_text: string | null, notification: string | null }> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'Error al subir el archivo');
  }
  return response.json();
};

// Contextual Help (RF07)
export const getContextualHelp = (
  message: string,
  previous_graph: GraphData | null,
  user_id: string // Añadir user_id si tu API lo necesita, aunque este no lo usa directamente
): Promise<{ help: string }> => {
  return fetchApi('/contextual_help', {
    method: 'POST',
    body: JSON.stringify({ message, previous_graph, user_id }), // user_id podría no ser necesario aquí
  });
};

// Analytics (RF09)
export const getAnalytics = (graph_id: string): Promise<{ analytics: any }> => {
  // El backend ahora usa ExportRequest que solo necesita graph_id y format (dummy)
   return fetchApi('/analyze_graph', {
    method: 'POST',
    body: JSON.stringify({ graph_id, format: 'json' }), // format es dummy
  });
};


export const updatePreferences = (user_id: string, content: Record<string, any>): Promise<{ preferences: Record<string, any> }> => {
  return fetchApi('/update_preferences', {
    method: 'POST',
    body: JSON.stringify({ user_id, content }),
  });
};

export const getPreferences = (user_id: string): Promise<{ preferences: Record<string, any> }> => {
  if (!user_id) return Promise.resolve({ preferences: {} });
  return fetchApi(`/get_preferences/${user_id}`);
};



// Comments (RF06, CU-03)
export const addComment = (
  graph_id: string,
  node_id: string,
  text: string,
  user_id: string
): Promise<{ graph: GraphData }> => {
  return fetchApi('/add_comment', {
    method: 'POST',
    body: JSON.stringify({ graph_id, node_id, text, user_id }),
  });
};