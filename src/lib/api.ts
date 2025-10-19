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
export const createUser = (persona_type: string = 'estudiante'): Promise<{ user_id: string }> => {
  return fetchApi('/create_user', {
    method: 'POST',
    body: JSON.stringify({ persona_type }),
  });
};

// Graph History (RF05)
export const getGraphHistory = (user_id: string): Promise<{ graphs: GraphSummary[] }> => {
  return fetchApi(`/graph_history/${user_id}`);
};

// Graph Data (CU-01)
export const getGraph = (graph_id: string): Promise<{ graph: GraphData }> => {
  return fetchApi(`/get_graph/${graph_id}`);
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
  previous_graph: GraphData | null
): Promise<{ help: string }> => {
  return fetchApi('/contextual_help', {
    method: 'POST',
    body: JSON.stringify({
      message,
      previous_graph,
      user_id: 'contextual_help_user', // user_id no es crítico aquí
    }),
  });
};

// Analytics (RF09)
export const getAnalytics = (graph_id: string): Promise<{ analytics: any }> => {
  return fetchApi('/analyze_graph', {
    method: 'POST',
    body: JSON.stringify({ graph_id, format: 'json' }), // format es dummy, endpoint no lo usa
  });
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