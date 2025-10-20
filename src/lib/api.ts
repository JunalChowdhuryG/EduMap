// src/lib/api.ts
import { GraphSummary, GraphData } from './types';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'Error en la solicitud a la API');
  }
  return response.json();
}

// --- CORREGIDO: createUser ---
export const createUser = (requestData: { user_id?: string } = {}): Promise<{ user_id: string }> => {
  // El body debe ser el objeto directamente, no anidado.
  return fetchApi('/create_user', {
    method: 'POST',
    body: JSON.stringify(requestData),
  });
};

export const getGraphHistory = (user_id: string): Promise<{ graphs: GraphSummary[] }> => {
  if (!user_id) return Promise.resolve({ graphs: [] });
  return fetchApi(`/graph_history/${user_id}`);
};

// --- CORREGIDO: getGraph ---
export const getGraph = (graph_id: string): Promise<{ graph: GraphData }> => {
   if (!graph_id) return Promise.reject("Graph ID es requerido");
  // La API ahora solo necesita el graph_id
  return fetchApi(`/get_graph/${graph_id}`);
};

export const generateGraph = (
  message: string,
  user_id: string,
  title: string,
  previous_graph: GraphData | null = null
): Promise<{ graph_id: string; graph: GraphData }> => {
  return fetchApi('/generate_graph', {
    method: 'POST',
    body: JSON.stringify({ message, user_id, title, previous_graph }),
  });
};

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

export const expandNode = (
  message: string,
  graph_id: string,
  user_id: string,
  previous_graph: GraphData
): Promise<{ graph_id: string; graph: GraphData }> => {
  return fetchApi('/expand_node', {
    method: 'POST',
    body: JSON.stringify({ message, graph_id, user_id, previous_graph }),
  });
};

export const uploadFile = async (file: File): Promise<{ extracted_text: string | null, notification: string | null }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${BASE_URL}/upload`, { method: 'POST', body: formData });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'Error al subir el archivo');
  }
  return response.json();
};

// --- API calls reactivadas ---
export const getContextualHelp = (message: string, previous_graph: GraphData | null, user_id: string): Promise<{ help: string }> => {
  return fetchApi('/contextual_help', {
    method: 'POST',
    body: JSON.stringify({ message, previous_graph, user_id }),
  });
};

export const getAnalytics = (graph_id: string): Promise<{ analytics: any }> => {
   return fetchApi('/analyze_graph', {
    method: 'POST',
    body: JSON.stringify({ graph_id, format: 'json' }),
  });
};

export const addComment = (graph_id: string, node_id: string, text: string, user_id: string): Promise<{ graph: GraphData }> => {
  return fetchApi('/add_comment', {
    method: 'POST',
    body: JSON.stringify({ graph_id, node_id, text, user_id }),
  });
};