// src/lib/useGraphTour.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { Node, Edge } from './types'; // Asegúrate de que la ruta a types.ts sea correcta

/**
 * Hook personalizado para gestionar un recorrido narrado del grafo.
 */
export function useGraphTour(nodes: Node[], edges: Edge[]) {
  const [isTouring, setIsTouring] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  
  // Usamos 'useRef' para que la cola y el audio persistan entre renders
  // sin disparar nuevos renders ellos mismos.
  const tourQueue = useRef<Node[]>([]);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

  /**
   * Determina un orden lógico de nodos para el recorrido (BFS).
   * Comienza desde nodos "raíz" (sin bordes de entrada).
   */
  const buildTourQueue = useCallback(() => {
    if (nodes.length === 0) return [];

    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const nodeMap = new Map<string, Node>();

    nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
      nodeMap.set(node.id, node);
    });

    edges.forEach(edge => {
      adjList.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    });

    // Empezar con nodos raíz (o todos si es cíclico/denso)
    let queue: string[] = nodes
      .filter(n => (inDegree.get(n.id) || 0) === 0)
      .map(n => n.id);
      
    // Si no hay nodos raíz (ej. un ciclo), simplemente empieza por el primero
    if (queue.length === 0 && nodes.length > 0) {
        queue.push(nodes[0].id);
    }

    const visited = new Set<string>();
    const orderedNodes: Node[] = [];

    // Recorrido BFS para un orden lógico
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      
      if (node) {
        orderedNodes.push(node);
      }

      const neighbors = adjList.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }
    
    // Añadir nodos que no se visitaron (en caso de grafos desconectados)
    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            orderedNodes.push(node);
        }
    });

    return orderedNodes;
  }, [nodes, edges]);

  /**
   * Reproduce el siguiente nodo en la cola.
   */
  const speakNext = useCallback(() => {
    if (tourQueue.current.length === 0) {
      setIsTouring(false);
      setCurrentNodeId(null);
      return;
    }

    const node = tourQueue.current.shift()!;
    setCurrentNodeId(node.id);

    // Narra la etiqueta y luego la descripción
    const textToSpeak = `${node.label}. ${node.description || 'Sin descripción.'}`;
    
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'es-ES';
    
    // Al terminar, llama a la siguiente narración
    utterance.onend = () => {
      speakNext();
    };
    
    // Si hay un error, simplemente salta al siguiente
    utterance.onerror = () => {
      console.warn("Error en SpeechSynthesis, saltando al siguiente nodo.");
      speakNext();
    };
    
    currentUtterance.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  /**
   * Inicia el recorrido.
   */
  const startTour = useCallback(() => {
    if (isTouring || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel(); // Limpia cualquier audio anterior
    tourQueue.current = buildTourQueue(); // Construye la cola
    
    if (tourQueue.current.length > 0) {
      setIsTouring(true);
      speakNext(); // Inicia la primera narración
    }
  }, [isTouring, buildTourQueue, speakNext]);

  /**
   * Detiene el recorrido.
   */
  const stopTour = useCallback(() => {
    setIsTouring(false);
    setCurrentNodeId(null);
    tourQueue.current = []; // Vacía la cola
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel(); // Detiene el audio actual
    }
  }, []);

  // Limpieza: Detener el recorrido si el componente se desmonta
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { startTour, stopTour, isTouring, currentNodeId };
}