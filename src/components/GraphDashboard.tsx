// src/components/GraphDashboard.tsx
import { useState, useEffect, useRef } from 'react';
import * as api from '../lib/api';
import { GraphSummary, GraphData, Node as NodeType, Preferences } from '../lib/types'; // Importar Preferences
import { GraphVisualization, GraphVisualizationHandle } from './GraphVisualization';
import { NodeDetailModal } from './NodeDetailModal';
import { SettingsModal } from './SettingsModal'; // <-- 1. Importar el nuevo modal
import { useGraphTour } from '../lib/useGraphTour';

import {
  Plus, FileText, Sparkles, FocusIcon, RefreshCw, Loader2, Upload,
  HelpCircle, BarChart2, Save, LogOut, Settings,
  FileJson,
  Play, StopCircle // <-- AÑADIR 'Play' Y 'StopCircle'
} from 'lucide-react';
interface ModalNode extends NodeType {}

interface GraphDashboardProps {
  userEmail: string;
  onLogout: () => void;
}

// Valores por defecto para las preferencias
const defaultPreferences: Preferences = {
  theme: 'dark',
  detail_level: 'detailed',
  persona_type: 'estudiante',
};

export function GraphDashboard({ userEmail, onLogout }: GraphDashboardProps) {
  const [user_id, setUserId] = useState<string | null>(() => sessionStorage.getItem('knowledge_graph_user_id'));
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraph, setSelectedGraph] = useState<GraphSummary | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [inputText, setInputText] = useState('');
  const [actionType, setActionType] = useState<'create' | 'refine' | 'add_content' | 'focus'>('create');
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [error, setError] = useState('');
  const [modalNode, setModalNode] = useState<ModalNode | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const { startTour, stopTour, isTouring, currentNodeId } = useGraphTour(
    graphData.nodes,
    graphData.edges
  );
  const ws = useRef<WebSocket | null>(null);
  const graphRef = useRef<GraphVisualizationHandle>(null);

  const handleNodeClick = (nodeData: NodeType) => { setModalNode(nodeData); };

  useEffect(() => {
    const initUser = async () => {
      let id = sessionStorage.getItem('knowledge_graph_user_id');
      if (!id) {
        try {
          const data = await api.createUser(); // Llama a tu backend de FastAPI
          id = data.user_id;
          sessionStorage.setItem('knowledge_graph_user_id', id);
        } catch (err: any) {
          setError(err.message || 'No se pudo inicializar la sesión de usuario.');
          return;
        }
      }
      if (id !== user_id) {
        setUserId(id);
      }
    };
    initUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user_id) return; // Esperar a tener user_id
      
      console.log("Cargando preferencias del usuario...");
      try {
        const data = await api.getPreferences(user_id);
        // Fusionar defaults con lo guardado para evitar campos undefined
        setPreferences({ ...defaultPreferences, ...data.preferences }); 
      } catch (err: any) {
        console.error("Error al cargar preferencias:", err);
        // No es un error crítico, usar defaults
      }
    };
    
    loadPreferences();
  }, [user_id]);

  useEffect(() => {
    const loadGraphs = async () => {
      if (!user_id) return;
      setLoading(true); setError('');
      try {
        const data = await api.getGraphHistory(user_id);
        setGraphs(data.graphs || []);
      } catch (err: any) {
        setError(err.message || 'Error cargando historial de grafos.');
      } finally { setLoading(false); }
    };
    loadGraphs();
  }, [user_id]);

  useEffect(() => {
    // Función para conectar al WebSocket (RF06)
    const connectWebSocket = (graphId: string) => {
      // Cierra cualquier conexión existente
      if (ws.current) {
        ws.current.close();
        console.log("Cerrando conexión WS anterior.");
      }
      
      // Construye la URL del WS (asegúrate que coincida con tu backend)
      // Si tu backend corre en 8000, la URL de WS es 'ws://'
      const wsUrl = `ws://localhost:8000/ws/${graphId}`;
      console.log(`Conectando a WebSocket: ${wsUrl}`);

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log(`WebSocket conectado para el grafo: ${graphId}`);
      };

      // Listener para mensajes entrantes
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Si el servidor envía una actualización, actualiza el grafo
          if (data.type === 'update' && data.graph) {
            console.log("Recibida actualización del grafo vía WebSocket!");
            setGraphData(data.graph);
            
            // Si el modal está abierto y el nodo se actualizó (ej. comentario nuevo),
            // actualiza el modal también.
            setModalNode(prevNode => {
              if (prevNode) {
                const updatedNode = data.graph.nodes.find((n: NodeType) => n.id === prevNode.id);
                return updatedNode || prevNode;
              }
              return null;
            });
          }
        } catch (e) {
          console.error("Error al procesar mensaje WS:", e);
        }
      };

      ws.current.onerror = (err) => {
        console.error("Error de WebSocket:", err);
      };

      ws.current.onclose = () => {
        console.log(`WebSocket desconectado del grafo: ${graphId}`);
      };
    };

  // Efecto para gestionar la conexión WebSocket
  useEffect(() => {
    if (!selectedGraph) {
      return;
    }

    const wsUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000')
        .replace('http', 'ws'); // Cambia http por ws

    ws.current = new WebSocket(`${wsUrl}/ws/${selectedGraph.id}`);

    ws.current.onopen = () => {
      console.log(`WebSocket conectado al grafo: ${selectedGraph.id}`);
    };

    // Escuchar actualizaciones de otros usuarios
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update' && data.graph) {
        console.log("Recibida actualización del grafo vía WebSocket");
        setGraphData(data.graph);

        // Si el nodo modal está abierto, actualizarlo también
        setModalNode(prevModalNode => {
          if (!prevModalNode) return null;
          const updatedNode = data.graph.nodes.find((n: NodeType) => n.id === prevModalNode.id);
          return updatedNode || null; // Cierra el modal si el nodo fue eliminado
        });
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket desconectado.");
    };

    ws.current.onerror = (err) => {
      console.error("Error de WebSocket:", err);
    };

    // Limpieza al cambiar de grafo o desmontar
    return () => {
      ws.current?.close();
    };
  }, [selectedGraph]); // Se reconecta cada vez que seleccionas un grafo diferente





    

    const loadGraphData = async (graphId: string) => {
      setLoading(true); setError('');
      try {
        const data = await api.getGraph(graphId);
        setGraphData(data.graph || { nodes: [], edges: [] });
        
        connectWebSocket(graphId);

      } catch (err: any) {
        setError(err.message || 'Error cargando datos del grafo');
      } finally { setLoading(false); }
    };

    if (selectedGraph) {
      loadGraphData(selectedGraph.id);
    }
    return () => {
      if (ws.current) {
        console.log("Cerrando conexión WS en cleanup.");
        ws.current.close();
        ws.current = null;
      }
    };
  }, [selectedGraph]);

  const handleGenerateGraph = async (
    isNodeExpansion: boolean = false,
    nodeExpandLabel: string = ''
  ) => {
     const textToUse = isNodeExpansion ? `Expandir: ${nodeExpandLabel}` : inputText;
    if (!textToUse.trim()) { setError('Por favor, introduce algún texto'); return; }
    if (!user_id) { setError('Usuario no inicializado'); return; }

    setLoading(true); setError('');
    try {
      const currentGraphId = selectedGraph?.id;
      const currentGraphData = (actionType !== 'create' && graphData.nodes.length > 0) ? graphData : null;
      let result: { graph_id: string; graph: GraphData };
      let effectiveActionType = isNodeExpansion ? 'focus' : actionType;

      switch (effectiveActionType) {
        case 'create':
          result = await api.generateGraph(textToUse, user_id, textToUse.substring(0, 100));
          const newGraphSummary = { id: result.graph_id, title: textToUse.substring(0, 100) };
          setGraphs(prevGraphs => [...prevGraphs, newGraphSummary]);
          setSelectedGraph(newGraphSummary); // Esto disparará el useEffect de WS
          setGraphData(result.graph); // Actualiza el estado local
          break;
         case 'refine':
          if (!currentGraphId) { setError('Selecciona un grafo para refinar'); return; }
          result = await api.refineGraph(textToUse, currentGraphId, user_id);
          setGraphData(result.graph); // Actualiza el estado local
          // El backend (API) notificará a otros clientes
          break;
        case 'add_content':
          if (!currentGraphId || !selectedGraph) { setError('Selecciona un grafo para añadir contenido'); return; }
          result = await api.generateGraph(textToUse, user_id, selectedGraph.title, currentGraphData);
           setGraphData(result.graph); // Actualiza el estado local
           setGraphs(prev => prev.map(g => g.id === currentGraphId ? {...g, title: selectedGraph.title} : g));
          break;
        case 'focus':
          if (!currentGraphId || !currentGraphData) { setError('Selecciona un grafo para enfocar'); return; }
          result = await api.expandNode(textToUse, currentGraphId, user_id, currentGraphData);
          setGraphData(result.graph); // Actualiza el estado local
           if (selectedGraph) {
              setGraphs(prev => prev.map(g => g.id === currentGraphId ? {...g, title: selectedGraph.title} : g));
           }
          break;
      }
      if (!isNodeExpansion) setInputText('');
    } catch (err: any) { setError(err.message || 'Ocurrió un error'); }
    finally { setLoading(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError('');
    try {
      const result = await api.uploadFile(file);
      if (result.extracted_text) setInputText(result.extracted_text);
      if (result.notification) setError(result.notification);
    } catch (err: any) { setError(err.message || 'Error al subir el archivo'); }
    finally { setLoading(false); }
    e.target.value = '';
  };

  const handleContextualHelp = async () => {
    if (!user_id) return;
    setLoading(true); setError('');
    try {
      // Añadimos el tipo de persona al prompt de ayuda (RF05 + RF07)
      const helpMessage = `Como un ${preferences.persona_type}, necesito ayuda con: ${inputText || 'ayuda general'}`;
      const result = await api.getContextualHelp(helpMessage, graphData.nodes.length > 0 ? graphData : null, user_id);
      alert(`Sugerencia para ${preferences.persona_type} (RF07):\n\n${result.help}`);
    } catch (err: any) { setError(err.message || 'Error al obtener ayuda'); }
    finally { setLoading(false); }
  };

  const handleAnalysis = async () => {
    if (!selectedGraph) return;
    setLoading(true); setError('');
    try {
      const result = await api.getAnalytics(selectedGraph.id);
      const analytics = result.analytics || {};
      const inDegree = analytics.in_degree_centrality || {};
      let analyticsText = "Análisis de Centralidad (RF09):\n\nGrado de Entrada (Importancia):\n";
      analyticsText += Object.entries(inDegree).sort(([, valA], [, valB]) => (valB as number) - (valA as number)).map(([label, val]) => `${label}: ${(val as number).toFixed(3)}`).join('\n');
      alert(analyticsText);
    } catch (err: any) { setError(err.message || 'Error al analizar el grafo'); }
    finally { setLoading(false); }
  };

  const handleNodeExpand = (node: ModalNode) => {
      setModalNode(null);
      handleGenerateGraph(true, node.label);
  };

  const handleExportPNG = () => {
    if (!graphRef.current?.canvasEl) { setError('El grafo no está listo para exportar.'); return; }
    const canvas = graphRef.current.canvasEl;
    if (canvas instanceof HTMLCanvasElement) {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${selectedGraph?.title?.replace(/[^a-z0-9]/gi, '_') || 'grafo'}.png`;
        link.click();
      } catch (e) { setError("No se pudo exportar como PNG."); }
    }
  };

  const handleSaveSettings = async (newPreferences: Preferences) => {
    if (!user_id) {
      setError("No se puede guardar, sesión no iniciada.");
      return;
    }
    setSettingsLoading(true);
    try {
      const data = await api.updatePreferences(user_id, newPreferences);
      setPreferences(data.preferences); // Actualizar estado local
      setShowSettingsModal(false); // Cerrar modal
    } catch (err: any) {
      console.error("Error al guardar preferencias:", err);
      setError(err.message || "No se pudo guardar preferencias.");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteNode = async (nodeToDelete: ModalNode) => {
    if (!user_id || !selectedGraph) {
      setError("Se requiere sesión y grafo para eliminar.");
      return;
    }
    
    // Advertencia de confirmación
    const nodeOwnerId = (nodeToDelete as any).owner_id;
    const isOwner = !nodeOwnerId || nodeOwnerId === user_id;
    const confirmMessage = isOwner
      ? `¿Estás seguro de que quieres eliminar el nodo "${nodeToDelete.label}"? Esta acción es irreversible.`
      : `ADVERTENCIA: Estás intentando eliminar un nodo de otro usuario. ¿Estás seguro?`;

    // NOTA: La lógica de confirmación real está en el backend, 
    // pero podemos usar la lógica de advertencia aquí.
    
    if (!confirm(`¿Estás seguro de que quieres eliminar el nodo "${nodeToDelete.label}"?`)) {
      return;
    }

    setDeleteLoading(true);
    try {
      // Llamamos al nuevo endpoint de la API
      await api.deleteNode(selectedGraph.id, nodeToDelete.id, user_id);
      
      // El WebSocket debería actualizar el grafo, pero cerramos el modal por si acaso.
      setModalNode(null);

    } catch (err: any) {
      // El backend devolverá un error 403 si no somos propietarios
      setError("Error al eliminar: " + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportJSON = async () => {
    if (!selectedGraph) {
      setError("Por favor, selecciona un grafo para exportar.");
      return;
    }
    setError('');
    
    try {
      // Llama a la API de exportación de JSON que ya existe
      const graphJsonData = await api.exportGraph(selectedGraph.id);
      
      // Crear un string JSON formateado
      const jsonString = JSON.stringify(graphJsonData, null, 2);
      
      // Crear un objeto Blob para descargar
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Crear un enlace temporal para iniciar la descarga
      const link = document.createElement('a');
      link.href = url;
      const fileName = `${selectedGraph.title?.replace(/[^a-z0-9]/gi, '_') || 'grafo'}.json`;
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      
      // Limpiar
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      console.error("Error al exportar JSON:", err);
      setError(err.message || "No se pudo exportar el JSON.");
    }
  };

  const themeClass = preferences.theme === 'light' ? 'theme-light' : 'theme-dark';

  return (
    <div className={`min-h-screen bg-gradient-to-br ${themeClass}`}>
      <header className="border-b border-theme-border bg-theme-header-bg bg-opacity-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-theme-text-primary">EduMap</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-theme-text-secondary hidden sm:inline">{userEmail}</span>
             <div className="flex items-center gap-1">
                <button onClick={() => setShowSettingsModal(true)} title="Ajustes (RF05)" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon"> <Settings size={20} /> </button>
                
                {/* --- 3. Añadir el nuevo botón de Exportar JSON --- */}
                <button
                  onClick={handleExportJSON}
                  title="Exportar como JSON (RF08)"
                  disabled={!selectedGraph || graphData.nodes.length === 0}
                  className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"
                >
                  <FileJson size={20} />
                </button>
                {/* --- Fin del nuevo botón --- */}

                <button onClick={handleExportPNG} title="Exportar como PNG (RF08)" disabled={!selectedGraph || graphData.nodes.length === 0} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <Save size={20} /> </button>
                <button onClick={handleContextualHelp} title="Ayuda Contextual (RF07)" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon"> <HelpCircle size={20} /> </button>
                <button onClick={handleAnalysis} title="Analizar Grafo (RF09)" disabled={!selectedGraph} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <BarChart2 size={20} /> </button>
                <button
                  onClick={() => (isTouring ? stopTour() : startTour())}
                  title={isTouring ? "Detener Recorrido" : "Iniciar Recorrido Narrado"}
                  disabled={!selectedGraph || graphData.nodes.length === 0}
                  className={`p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50 ${isTouring ? 'text-red-400' : ''}`}
                >
                  {isTouring ? <StopCircle size={20} /> : <Play size={20} />}
                </button>
                <label htmlFor="file-upload" title="Subir Archivo (.txt, .pdf, .mp3, etc.)" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon cursor-pointer"> <Upload size={20} /> </label>
                <input id="file-upload" type="file" className="hidden" onChange={handleFileUpload}/>
             </div>
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 bg-theme-secondary-bg hover:bg-theme-hover rounded-lg transition-colors text-sm text-theme-text-secondary">
              <LogOut size={16} /> Salir
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 text-theme-text-primary">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
           <div className="lg:col-span-1 space-y-4 overflow-auto">
             <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border">
                <h2 className="text-lg font-semibold mb-4">Grafos de esta Sesión</h2>
                 {loading && graphs.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
                 {!loading && graphs.length === 0 && !error && <p className="text-sm text-slate-500">Crea tu primer grafo.</p>}
                 {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="space-y-2 mt-2">
                    {graphs.map((graph) => (
                    <button key={graph.id} onClick={() => setSelectedGraph(graph)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedGraph?.id === graph.id ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                        <div className="font-medium truncate">{graph.title || 'Grafo sin título'}</div>
                    </button>
                    ))}
                </div>
             </div>

             <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border">
                   <h3 className="text-sm font-semibold mb-3">Tipo de Acción</h3>
                   <div className="space-y-2">
                      <button onClick={() => setActionType('create')} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'create' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}> <Plus size={16} /> Crear Nuevo </button>
                      <button onClick={() => setActionType('add_content')} disabled={!selectedGraph} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'add_content' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}> <FileText size={16} /> Añadir Contenido </button>
                      <button onClick={() => setActionType('refine')} disabled={!selectedGraph} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'refine' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}> <RefreshCw size={16} /> Refinar (Feedback) </button>
                      <button onClick={() => setActionType('focus')} disabled={!selectedGraph} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'focus' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}> <FocusIcon size={16} /> Enfocar Tópico </button>
                   </div>
              </div>
           </div>

            {/* --- INICIO DEL BLOQUE CORREGIDO --- */}
           <div className="lg:col-span-3 flex flex-col gap-4">
              {/* Este es el bloque que faltaba */}
              <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escribe texto, una instrucción (ej: 'Refinar sobre...') o sube un archivo para empezar."
                  className="w-full h-32 px-4 py-3 bg-theme-input-bg border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                {error && (<div className="mt-2 text-sm text-red-400">{error}</div>)}
                <button
                  onClick={() => handleGenerateGraph(false)}
                  disabled={loading || !user_id}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white"
                >
                  {loading ? (<><Loader2 size={20} className="animate-spin" /> Generando...</>) : (<><Sparkles size={20} /> Generar / Modificar Grafo</>)}
                </button>
              </div>
              {/* Fin del bloque que faltaba */}

                <div className="flex-1 bg-theme-secondary-bg rounded-lg border border-theme-border overflow-hidden">
                    {loading && <div className="flex items-center justify-center h-full text-theme-text-secondary"><Loader2 className="animate-spin mr-2"/> Cargando...</div>}
                    {!loading && graphData.nodes.length > 0 ? (
                        <GraphVisualization
                            ref={graphRef}
                            nodes={graphData.nodes}
                            edges={graphData.edges}
                            onNodeClick={handleNodeClick}
                            // --- 8. Pasar nivel de detalle (RF05) ---
                            detailLevel={preferences.detail_level}
                            theme={preferences.theme}
                            highlightNodeId={currentNodeId}
                        />
                    ) : (
                       !loading && (
                         <div className="flex items-center justify-center h-full text-theme-text-secondary">
                            <div className="text-center">
                                <FileText size={48} className="mx-auto mb-4 opacity-50" />
                                <p>{selectedGraph ? 'Este grafo está vacío.' : 'Selecciona un grafo o crea uno nuevo para empezar'}</p>
                            </div>
                         </div>
                       )
                    )}
                </div>
           </div>
           {/* --- FIN DEL BLOQUE CORREGIDO --- */}

        </div>
      </div>


       {modalNode && (
        <NodeDetailModal
          node={modalNode}
          onClose={() => setModalNode(null)}
          onExpandNode={handleNodeExpand}
          onAddComment={async (text) => {
            if (!user_id || !selectedGraph) { setError("Se requiere sesión y grafo para comentar."); return; }
            try {
                 const result = await api.addComment(selectedGraph.id, modalNode.id, text, user_id);
                 setGraphData(result.graph);
                 const updatedNode = result.graph.nodes.find(n => n.id === modalNode.id);
                 if (updatedNode) setModalNode(updatedNode);
            } catch (commentError: any) { setError("Error al añadir comentario: " + commentError.message); }
          }}
          onDeleteNode={handleDeleteNode}
          isDeleting={deleteLoading}
        />
      )}
      {showSettingsModal && (
        <SettingsModal
          currentPreferences={preferences}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveSettings}
          isLoading={settingsLoading}
        />
       )}
    </div>
  );
}