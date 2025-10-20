// src/components/GraphDashboard.tsx
import { useState, useEffect, useRef } from 'react';
import * as api from '../lib/api';
import { GraphSummary, GraphData, Node as NodeType } from '../lib/types';
import { GraphVisualization, GraphVisualizationHandle } from './GraphVisualization';
import { NodeDetailModal } from './NodeDetailModal';
import {
  Plus, FileText, Sparkles, FocusIcon, RefreshCw, Loader2, Upload, HelpCircle, BarChart2, Save, LogOut // Añadido LogOut
} from 'lucide-react';

interface ModalNode extends NodeType {}

// --- Nuevas Props ---
interface GraphDashboardProps {
  userEmail: string;
  onLogout: () => void;
}

export function GraphDashboard({ userEmail, onLogout }: GraphDashboardProps) {
  // --- Estado user_id ahora usa sessionStorage ---
  const [user_id, setUserId] = useState<string | null>(() => sessionStorage.getItem('knowledge_graph_user_id'));
  // --- Fin cambio sessionStorage ---

  // El estado de 'graphs' ahora vive solo aquí
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

  const handleNodeClick = (nodeData: NodeType) => { setModalNode(nodeData); };

  // --- useEffect initUser modificado para sessionStorage ---
  useEffect(() => {
    const initUser = async () => {
      let id = sessionStorage.getItem('knowledge_graph_user_id'); // Leer de sessionStorage
      if (!id) {
        try {
          console.log("No user_id in session, creating one...");
          // Pasar el ID existente si está en el estado (poco probable aquí, pero seguro)
          const requestData = user_id ? { user_id } : {};
          const data = await api.createUser(requestData);
          id = data.user_id;
          sessionStorage.setItem('knowledge_graph_user_id', id); // Guardar en sessionStorage
          console.log("User session created with ID:", id);
        } catch (err: any) {
          console.error("Error creating user session:", err);
          setError(err.message || 'No se pudo inicializar la sesión de usuario.');
          return;
        }
      } else {
         console.log("User ID found in session:", id);
      }
      // Solo actualiza el estado si es diferente
      if (id !== user_id) {
        setUserId(id);
      }
    };
    initUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dependencia user_id eliminada para evitar bucle, sessionStorage es la fuente de verdad inicial

  // useEffect loadGraphs (ahora usa el estado 'graphs', no local)
  useEffect(() => {
    const loadGraphs = async () => {
      if (!user_id) return;
      console.log(`loadGraphs: Fetching history for user_id: ${user_id}`);
      setLoading(true); setError('');
      try {
        const data = await api.getGraphHistory(user_id);
        setGraphs(data.graphs || []); // Actualiza el estado directamente
        console.log("Graph history loaded:", data.graphs);
      } catch (err: any) {
        console.error("Error loading graph history:", err);
        setError(err.message || 'Error cargando historial de grafos.');
      } finally { setLoading(false); }
    };
    loadGraphs();
  }, [user_id]); // Depende de user_id

   // useEffect loadGraphData (modificado para usar user_id en la llamada)
   useEffect(() => {
    const loadGraphData = async (userId: string, graphId: string) => {
      setLoading(true); setError('');
      try {
        // --- Usa la nueva ruta con user_id ---
        const data = await api.getGraph(userId, graphId);
        setGraphData(data.graph || { nodes: [], edges: [] });
      } catch (err: any) {
        setError(err.message || 'Error cargando datos del grafo');
      } finally { setLoading(false); }
    };

    if (selectedGraph && user_id) { // Necesitamos user_id aquí
      loadGraphData(user_id, selectedGraph.id);
      // connectWebSocket(selectedGraph.id); // WebSocket opcional
    }

    // return () => { ws.current?.close(); }; // Opcional
  }, [selectedGraph, user_id]); // Añadido user_id como dependencia


   // WebSocket (opcional, sin cambios si se mantiene)
   const connectWebSocket = (graphId: string) => { /* ... */ };
   const broadcastGraphUpdate = (updatedGraph: GraphData) => { /* ... */ };

  // handleGenerateGraph (actualiza estado 'graphs' directamente)
  const handleGenerateGraph = async (
    isNodeExpansion: boolean = false,
    nodeExpandLabel: string = ''
  ) => {
    // ... (lógica anterior sin cambios hasta la actualización del estado) ...
     const textToUse = isNodeExpansion ? `Expandir: ${nodeExpandLabel}` : inputText;
    if (!textToUse.trim()) { setError('Por favor, introduce algún texto'); return; }
    if (!user_id) { setError('Usuario no inicializado'); return; }

    setLoading(true); setError('');
    try {
        // ... (switch case como antes) ...
       const currentGraphId = selectedGraph?.id;
      const currentGraphData = (actionType !== 'create' && graphData.nodes.length > 0) ? graphData : null;
      let result: { graph_id: string; graph: GraphData };
      let effectiveActionType = isNodeExpansion ? 'focus' : actionType;
       let newGraphCreated = false;

      switch (effectiveActionType) {
        case 'create':
          result = await api.generateGraph(textToUse, user_id, textToUse.substring(0, 100));
          // --- Actualizar estado 'graphs' en memoria ---
          const newGraphSummary = { id: result.graph_id, title: textToUse.substring(0, 100) };
          setGraphs(prevGraphs => [...prevGraphs, newGraphSummary]);
          setSelectedGraph(newGraphSummary); // Seleccionar el nuevo
          // --- Fin actualización estado ---
          setGraphData(result.graph);
          newGraphCreated = true;
          break;
        // ... (casos 'refine', 'add_content', 'focus' actualizan graphData y llaman a broadcast) ...
         case 'refine':
          if (!currentGraphId) { setError('Selecciona un grafo para refinar'); return; }
          result = await api.refineGraph(textToUse, currentGraphId, user_id);
          setGraphData(result.graph); // broadcastGraphUpdate(result.graph);
          break;
        case 'add_content':
          if (!currentGraphId || !selectedGraph) { setError('Selecciona un grafo para añadir contenido'); return; }
          result = await api.generateGraph(textToUse, user_id, selectedGraph.title, currentGraphData);
           setGraphData(result.graph); // broadcastGraphUpdate(result.graph);
           // Actualizar título en el historial si cambió (poco probable aquí)
           setGraphs(prev => prev.map(g => g.id === currentGraphId ? {...g, title: selectedGraph.title} : g));
          break;
        case 'focus':
          if (!currentGraphId || !currentGraphData) { setError('Selecciona un grafo para enfocar'); return; }
          result = await api.expandNode(textToUse, currentGraphId, user_id, currentGraphData);
          setGraphData(result.graph); // broadcastGraphUpdate(result.graph);
          // Actualizar título en el historial si cambió (poco probable aquí)
           if (selectedGraph) {
              setGraphs(prev => prev.map(g => g.id === currentGraphId ? {...g, title: selectedGraph.title} : g));
           }
          break;
        default: // Agregado default para exhaustividad
             console.error("Tipo de acción desconocido:", effectiveActionType);
             throw new Error("Tipo de acción desconocido");
      }


      if (!isNodeExpansion) setInputText('');

      // Si no se creó un grafo nuevo, pero se modificó uno existente,
      // asegurarse de que el título esté actualizado en `graphs`
      if (!newGraphCreated && selectedGraph) {
          const currentTitleInState = graphs.find(g => g.id === selectedGraph.id)?.title;
          // Si el título en el estado local difiere del potencialmente actualizado (ej. en refine/add/focus)
          // (Aunque la API actual no devuelve título actualizado, es buena práctica)
          if (currentTitleInState !== selectedGraph.title) {
               setGraphs(prev => prev.map(g => g.id === selectedGraph.id ? {...g, title: selectedGraph.title} : g));
          }
      }

    } catch (err: any) { setError(err.message || 'Ocurrió un error'); }
    finally { setLoading(false); }
  };

  // handleFileUpload, handleContextualHelp, handleAnalysis (sin cambios)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { /* ... */ };
  const handleContextualHelp = async () => {
    if (!user_id) { setError("Inicia sesión primero."); return; } // Necesitamos user_id
    setLoading(true); setError('');
    try {
      const result = await api.getContextualHelp(
        inputText || 'Ayuda general sobre cómo usar el generador de grafos',
        graphData.nodes.length > 0 ? graphData : null,
        user_id // Pasar user_id
      );
      alert(`Sugerencia de Ayuda (RF07):\n\n${result.help}`);
    } catch (err: any) { setError(err.message || 'Error al obtener ayuda'); }
    finally { setLoading(false); }
  };
  const handleAnalysis = async () => {
    if (!selectedGraph) { setError('Selecciona un grafo para analizar'); return; }
    setLoading(true); setError('');
    try {
      const result = await api.getAnalytics(selectedGraph.id); // Llamar a la API
      const analytics = result.analytics || {};
      const inDegree = analytics.in_degree_centrality || {};
      const outDegree = analytics.out_degree_centrality || {};

      let analyticsText = "Análisis de Centralidad (RF09):\n\nGrado de Entrada (Importancia):\n";
      analyticsText += Object.entries(inDegree)
          .sort(([, valA], [, valB]) => (valB as number) - (valA as number)) // Ordenar
          .map(([label, centralityValue]) => `${label}: ${(centralityValue as number).toFixed(3)}`)
          .join('\n');

      analyticsText += "\n\nGrado de Salida (Influencia):\n";
      analyticsText += Object.entries(outDegree)
          .sort(([, valA], [, valB]) => (valB as number) - (valA as number)) // Ordenar
          .map(([label, centralityValue]) => `${label}: ${(centralityValue as number).toFixed(3)}`)
          .join('\n');

      alert(analyticsText);
    } catch (err: any) { setError(err.message || 'Error al analizar el grafo'); }
    finally { setLoading(false); }
  };
  // handleNodeExpand (sin cambios)
  const handleNodeExpand = (node: ModalNode) => {
      setModalNode(null);
      handleGenerateGraph(true, node.label);
  };


  // handleExportPNG (Verificación - Lógica correcta)
  const handleExportPNG = () => {
    if (!graphRef.current) { setError('Referencia del grafo no encontrada.'); return; }
    // Accede al canvas a través del handle expuesto por GraphVisualization
    const canvas = graphRef.current.canvasEl;
    if (canvas instanceof HTMLCanvasElement) { // Verifica que sea un canvas
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${selectedGraph?.title?.replace(/[^a-z0-9]/gi, '_') || 'grafo'}.png`; // Limpia el nombre del archivo
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
         setError(''); // Limpiar errores si funciona
      } catch (e) {
         console.error("Error exporting PNG:", e);
         setError("No se pudo exportar como PNG. El grafo puede ser muy complejo o el navegador no lo soporta.");
      }
    } else {
       setError('No se pudo acceder al elemento canvas del grafo.');
       console.warn("graphRef.current.canvasEl no es un HTMLCanvasElement:", canvas);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* --- Header Modificado: Muestra email y botón Salir --- */}
      <header className="border-b border-slate-700 bg-slate-900 bg-opacity-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Knowledge Graph</h1>
          <div className="flex items-center gap-4">
            {/* Mostrar email */}
            <span className="text-sm text-slate-400 hidden sm:inline">{userEmail}</span>
             {/* Botones de acción */}
             <div className="flex items-center gap-1">
                <button onClick={handleExportPNG} /* ... */ > <Save size={20} /> </button>
                <button onClick={handleContextualHelp} title="Ayuda Contextual (RF07)" className="p-2 hover:bg-slate-700 rounded-lg transition-colors"> <HelpCircle size={20} /> </button>
                <button onClick={handleAnalysis} title="Analizar Grafo (RF09)" disabled={!selectedGraph} className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"> <BarChart2 size={20} /> </button>
                <label htmlFor="file-upload" title="Subir Archivo (.txt)" className="p-2 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"> <Upload size={20} /> </label>
                <input id="file-upload" type="file" className="hidden" accept=".txt" onChange={handleFileUpload}/> {/* Simplificado a .txt */}
             </div>
            {/* Botón Salir */}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
            >
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </div>
      </header>
       {/* --- Fin Header Modificado --- */}


      {/* Resto del Layout (sin cambios estructurales) */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
           {/* Columna Izquierda: Grafos de la Sesión */}
           <div className="lg:col-span-1 space-y-4 overflow-auto">
             <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
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
              {/* Tipo de Acción */}
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                   <h3 className="text-sm font-semibold mb-3">Tipo de Acción</h3>
                   {/* ... botones ... */}
              </div>
           </div>

            {/* Columna Derecha */}
           <div className="lg:col-span-3 flex flex-col gap-4">
               {/* ... (Textarea y Botón Generar) ... */}
                <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                    {/* ... (Lógica condicional para mostrar GraphVisualization o mensajes) ... */}
                    {/* Asegurarse que onNodeClick={handleNodeClick} esté bien pasado a GraphVisualization */}
                     {selectedGraph && graphData.nodes.length > 0 && !loading && (
                        <GraphVisualization
                            ref={graphRef}
                            nodes={graphData.nodes}
                            edges={graphData.edges}
                            onNodeClick={handleNodeClick} // Correcto
                        />
                     )}
                     {/* ... (Otros mensajes de estado) ... */}
                </div>
           </div>
        </div>
      </div>

       {modalNode && (
        <NodeDetailModal
          node={modalNode}
          onClose={() => setModalNode(null)}
          onExpandNode={handleNodeExpand}
          onAddComment={async (text) => { // La función ahora llama a la API reactivada
            if (!user_id || !selectedGraph) {
              setError("Se requiere usuario y grafo seleccionado para comentar.");
              return; // Salir si falta algo
            }
            try {
                 const result = await api.addComment(selectedGraph.id, modalNode.id, text, user_id);
                 setGraphData(result.graph); // Actualiza el grafo local con la respuesta
                 // broadcastGraphUpdate(result.graph); // Descomentar si usas WebSocket
                 // Actualiza el nodo en el modal para ver el comentario al instante
                 const updatedNode = result.graph.nodes.find(n => n.id === modalNode.id);
                 if (updatedNode) setModalNode(updatedNode);
            } catch (commentError: any) {
                 console.error("Error adding comment via modal:", commentError);
                 setError("Error al añadir comentario: " + commentError.message);
            }
          }}
        />
      )}
    </div>
  );
}