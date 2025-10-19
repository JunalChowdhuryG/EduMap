// src/components/GraphDashboard.tsx
import { useState, useEffect, useRef } from 'react';
import * as api from '../lib/api';
import { GraphSummary, GraphData, Node as NodeType } from '../lib/types'; // Renombrado Node a NodeType para evitar conflicto
import { GraphVisualization, GraphVisualizationHandle } from './GraphVisualization';
import { NodeDetailModal } from './NodeDetailModal';
import {
  Plus,
  FileText,
  Sparkles,
  FocusIcon,
  RefreshCw,
  Loader2,
  Upload,
  HelpCircle,
  BarChart2,
  Save,
} from 'lucide-react';

// Interfaz para el nodo del modal (ahora coincide con la Node real)
interface ModalNode extends NodeType {}

export function GraphDashboard() {
  const [user_id, setUserId] = useState<string | null>(null);
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraph, setSelectedGraph] = useState<GraphSummary | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [inputText, setInputText] = useState('');
  const [actionType, setActionType] = useState<'create' | 'refine' | 'add_content' | 'focus'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [modalNode, setModalNode] = useState<ModalNode | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const graphRef = useRef<GraphVisualizationHandle>(null);

  // --- DEFINICIÓN DE handleNodeClick ---
  // Esta es la función que se ejecutará cuando se haga clic en un nodo en GraphVisualization
  const handleNodeClick = (nodeData: NodeType) => {
    // nodeData viene de GraphVisualization y ya tiene el formato correcto (NodeType)
    setModalNode(nodeData);
  };
  // --- FIN DE LA DEFINICIÓN ---


  // useEffect para initUser (sin cambios)
  useEffect(() => {
    const initUser = async () => {
      let id = localStorage.getItem('knowledge_graph_user_id');
      if (!id) {
        try {
          // Asegúrate que el backend esté corriendo y responda a /create_user
          const data = await api.createUser('estudiante');
          id = data.user_id;
          localStorage.setItem('knowledge_graph_user_id', id);
        } catch (err: any) {
           // Si falla aquí, veremos "Usuario no inicializado" después
          console.error("Error creating user:", err);
          setError(err.message || 'No se pudo inicializar el usuario. ¿Está el backend corriendo?');
          return;
        }
      }
      setUserId(id);
    };
    initUser();
  }, []);

  // useEffect para loadGraphs (sin cambios)
  useEffect(() => {
    const loadGraphs = async () => {
      if (!user_id) return; // Espera a tener user_id
      setLoading(true);
      setError(''); // Limpiar errores previos
      try {
        const data = await api.getGraphHistory(user_id);
        setGraphs(data.graphs || []);
      } catch (err: any) {
        console.error("Error loading graph history:", err);
        // El error "Usuario no encontrado" del backend saldría aquí si el user_id es inválido
        setError(err.message || 'Error cargando grafos');
      } finally {
        setLoading(false);
      }
    };
    loadGraphs();
  }, [user_id]); // Se ejecuta cuando user_id cambia


  // useEffect para loadGraphData y WebSocket (sin cambios)
   useEffect(() => {
    const loadGraphData = async (graphId: string) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.getGraph(graphId);
        setGraphData(data.graph || { nodes: [], edges: [] });
      } catch (err: any) {
        setError(err.message || 'Error cargando datos del grafo');
      } finally {
        setLoading(false);
      }
    };

    if (selectedGraph) {
      loadGraphData(selectedGraph.id);
      connectWebSocket(selectedGraph.id);
    }

    return () => {
      ws.current?.close();
    };
  }, [selectedGraph]);

  // connectWebSocket y broadcastGraphUpdate (sin cambios)
  const connectWebSocket = (graphId: string) => {
    if (ws.current) {
      ws.current.close();
    }
    const wsUrl = `ws://localhost:8000/ws/${graphId}`; // Asegúrate que el puerto es correcto
    ws.current = new WebSocket(wsUrl);
    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update' && data.graph) {
          setGraphData(data.graph);
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };
    ws.current.onerror = (err) => {
      console.error('Error de WebSocket:', err);
      // Podrías intentar reconectar aquí si es necesario
    };
     ws.current.onclose = () => {
        console.log('WebSocket disconnected');
     };
  };

  const broadcastGraphUpdate = (updatedGraph: GraphData) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'edit',
        graph: updatedGraph,
      }));
    }
  };


  // handleGenerateGraph (sin cambios en la lógica principal)
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
          const history = await api.getGraphHistory(user_id);
          setGraphs(history.graphs || []);
          setSelectedGraph(history.graphs.find(g => g.id === result.graph_id) || null);
          setGraphData(result.graph);
          break;
        case 'refine':
          if (!currentGraphId) { setError('Selecciona un grafo para refinar'); return; }
          result = await api.refineGraph(textToUse, currentGraphId, user_id);
          setGraphData(result.graph); broadcastGraphUpdate(result.graph);
          break;
        case 'add_content':
          if (!currentGraphId || !selectedGraph) { setError('Selecciona un grafo para añadir contenido'); return; }
          result = await api.generateGraph(textToUse, user_id, selectedGraph.title, currentGraphData);
          setGraphData(result.graph); broadcastGraphUpdate(result.graph);
          break;
        case 'focus':
          if (!currentGraphId || !currentGraphData) { setError('Selecciona un grafo para enfocar'); return; }
          result = await api.expandNode(textToUse, currentGraphId, user_id, currentGraphData);
          setGraphData(result.graph); broadcastGraphUpdate(result.graph);
          break;
      }
      if (!isNodeExpansion) setInputText('');
    } catch (err: any) { setError(err.message || 'Ocurrió un error'); }
    finally { setLoading(false); }
  };


  // handleFileUpload (sin cambios)
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

  // handleContextualHelp (sin cambios)
  const handleContextualHelp = async () => {
    setLoading(true);
    try {
      const result = await api.getContextualHelp(
        inputText || 'Ayuda general sobre cómo usar el generador de grafos',
        graphData.nodes.length > 0 ? graphData : null
      );
      alert(`Sugerencia de Ayuda:\n\n${result.help}`);
    } catch (err: any) { setError(err.message || 'Error al obtener ayuda'); }
    finally { setLoading(false); }
  };


  // --- CORREGIDO: handleAnalysis (Tipado de centrality) ---
  const handleAnalysis = async () => {
    if (!selectedGraph) { setError('Selecciona un grafo para analizar'); return; }
    setLoading(true); setError('');
    try {
      const result = await api.getAnalytics(selectedGraph.id);
      // Añadimos un tipo más específico si esperamos un objeto string: number
      const centralityData = result.analytics?.centrality as Record<string, number> | undefined;

      if (centralityData) {
        const analyticsText = Object.entries(centralityData)
          // Ordenar por centralidad descendente
          .sort(([, valA], [, valB]) => valB - valA)
          .map(([label, centralityValue]) => `${label}: ${centralityValue.toFixed(3)}`)
          .join('\n');
        alert(`Análisis de Centralidad (RF09):\n${analyticsText}`);
      } else {
        alert('No se pudieron calcular las métricas de centralidad.');
      }
    } catch (err: any) { setError(err.message || 'Error al analizar el grafo'); }
    finally { setLoading(false); }
  };


  // handleNodeExpand (sin cambios)
   const handleNodeExpand = (node: ModalNode) => {
    setModalNode(null);
    handleGenerateGraph(true, node.label);
  };

  // handleExportPNG (sin cambios)
  const handleExportPNG = () => {
    if (!graphRef.current) { setError('El grafo no está renderizado'); return; }
    const canvas = graphRef.current.canvasEl;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${selectedGraph?.title || 'grafo'}.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else {
       setError('No se pudo acceder al canvas del grafo.');
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header (sin cambios) */}
       <header className="border-b border-slate-700 bg-slate-900 bg-opacity-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Knowledge Graph Generator</h1>
          <div className="flex items-center gap-2">
            <button onClick={handleExportPNG} title="Exportar como PNG (RF08)" disabled={!selectedGraph} className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"> <Save size={20} /> </button>
            <button onClick={handleContextualHelp} title="Ayuda Contextual (RF07)" className="p-2 hover:bg-slate-700 rounded-lg transition-colors"> <HelpCircle size={20} /> </button>
            <button onClick={handleAnalysis} title="Analizar Grafo (RF09)" disabled={!selectedGraph} className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"> <BarChart2 size={20} /> </button>
            <label htmlFor="file-upload" title="Subir Archivo (RF08)" className="p-2 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"> <Upload size={20} /> </label>
            <input id="file-upload" type="file" className="hidden" accept=".txt,.pdf,.wav,.mp3,.png,.jpg" onChange={handleFileUpload}/>
          </div>
        </div>
      </header>


      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
          {/* Columna Izquierda (sin cambios) */}
          <div className="lg:col-span-1 space-y-4 overflow-auto">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h2 className="text-lg font-semibold mb-4">Tus Grafos</h2>
               {/* Mostrar mensaje si no hay user_id */}
              {!user_id && <p className="text-sm text-yellow-400">Inicializando usuario...</p>}
              {/* Mostrar mensaje si hay error */}
              {error && user_id && graphs.length === 0 && <p className="text-sm text-red-400">Error cargando grafos. Revisa la consola.</p>}
              <div className="space-y-2">
                {graphs.map((graph) => (
                  <button key={graph.id} onClick={() => setSelectedGraph(graph)} className={`w-full text-left p-3 rounded-lg transition-colors ${selectedGraph?.id === graph.id ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    <div className="font-medium truncate">{graph.title || 'Grafo sin título'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold mb-3">Tipo de Acción</h3>
              <div className="space-y-2">
                 <button onClick={() => setActionType('create')} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'create' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}> <Plus size={16} /> Crear Nuevo </button>
                 <button onClick={() => setActionType('add_content')} disabled={!selectedGraph} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'add_content' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}> <FileText size={16} /> Añadir Contenido </button>
                 <button onClick={() => setActionType('refine')} disabled={!selectedGraph} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'refine' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}> <RefreshCw size={16} /> Refinar (Feedback) </button>
                 <button onClick={() => setActionType('focus')} disabled={!selectedGraph} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${actionType === 'focus' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} disabled:opacity-50 disabled:cursor-not-allowed`}> <FocusIcon size={16} /> Enfocar Tópico </button>
              </div>
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Escribe texto o una instrucción (ej: 'Refinar sobre...') o sube un archivo..." className="w-full h-32 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
              {error && (<div className="mt-2 text-sm text-red-400">{error}</div>)}
              <button onClick={() => handleGenerateGraph(false)} disabled={loading || !user_id} className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (<><Loader2 size={20} className="animate-spin" /> Generando...</>) : (<><Sparkles size={20} /> Generar Grafo</>)}
              </button>
            </div>

            <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              {selectedGraph && graphData.nodes.length > 0 ? ( // Añadida condición graphData.nodes.length > 0
                <GraphVisualization
                  ref={graphRef}
                  nodes={graphData.nodes}
                  edges={graphData.edges}
                  // --- CORREGIDO: Pasar la función correcta ---
                  onNodeClick={handleNodeClick}
                  // --- FIN DE CORRECCIÓN ---
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <FileText size={48} className="mx-auto mb-4 opacity-50" />
                     {/* Mensaje dinámico */}
                    {loading && <p>Cargando grafo...</p>}
                    {!loading && !selectedGraph && <p>Selecciona un grafo o crea uno nuevo para empezar</p>}
                    {!loading && selectedGraph && graphData.nodes.length === 0 && <p>Este grafo está vacío o aún no se ha cargado.</p>}
                    {error && <p className="text-red-400 mt-2">{error}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal (sin cambios estructurales, solo pasa la función correcta) */}
      {modalNode && (
        <NodeDetailModal
          node={modalNode}
          onClose={() => setModalNode(null)}
          onExpandNode={handleNodeExpand}
          onAddComment={async (text) => {
            if (!user_id || !selectedGraph) return;
            // Manejo de errores local en el modal si es necesario
            try {
                 const result = await api.addComment(selectedGraph.id, modalNode.id, text, user_id);
                 setGraphData(result.graph);
                 broadcastGraphUpdate(result.graph);
                 const updatedNode = result.graph.nodes.find(n => n.id === modalNode.id);
                 if (updatedNode) setModalNode(updatedNode);
            } catch (commentError: any) {
                 console.error("Error adding comment via modal:", commentError);
                 setError("Error al añadir comentario: " + commentError.message); // Mostrar error globalmente
            }
          }}
        />
      )}
    </div>
  );
}