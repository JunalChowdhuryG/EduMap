// src/components/GraphDashboard.tsx
import { useState, useEffect, useRef } from 'react';
import * as api from '../lib/api';
import { GraphSummary, GraphData, Node as NodeType } from '../lib/types';
import { GraphVisualization, GraphVisualizationHandle } from './GraphVisualization';
import { NodeDetailModal } from './NodeDetailModal';
import {
  Plus, FileText, Sparkles, FocusIcon, RefreshCw, Loader2, Upload, HelpCircle, BarChart2, Save, LogOut
} from 'lucide-react';

interface ModalNode extends NodeType {}

interface GraphDashboardProps {
  userEmail: string;
  onLogout: () => void;
}

export function GraphDashboard({ userEmail, onLogout }: GraphDashboardProps) {
  const [user_id, setUserId] = useState<string | null>(() => sessionStorage.getItem('knowledge_graph_user_id'));
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

  useEffect(() => {
    const initUser = async () => {
      let id = sessionStorage.getItem('knowledge_graph_user_id');
      if (!id) {
        try {
          const data = await api.createUser();
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
    const loadGraphData = async (graphId: string) => {
      setLoading(true); setError('');
      try {
        // La API ahora no necesita user_id para obtener un grafo
        const data = await api.getGraph(graphId);
        setGraphData(data.graph || { nodes: [], edges: [] });
      } catch (err: any) {
        setError(err.message || 'Error cargando datos del grafo');
      } finally { setLoading(false); }
    };

    if (selectedGraph) {
      loadGraphData(selectedGraph.id);
    }
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
          setSelectedGraph(newGraphSummary);
          setGraphData(result.graph);
          break;
         case 'refine':
          if (!currentGraphId) { setError('Selecciona un grafo para refinar'); return; }
          result = await api.refineGraph(textToUse, currentGraphId, user_id);
          setGraphData(result.graph);
          break;
        case 'add_content':
          if (!currentGraphId || !selectedGraph) { setError('Selecciona un grafo para añadir contenido'); return; }
          result = await api.generateGraph(textToUse, user_id, selectedGraph.title, currentGraphData);
           setGraphData(result.graph);
           setGraphs(prev => prev.map(g => g.id === currentGraphId ? {...g, title: selectedGraph.title} : g));
          break;
        case 'focus':
          if (!currentGraphId || !currentGraphData) { setError('Selecciona un grafo para enfocar'); return; }
          result = await api.expandNode(textToUse, currentGraphId, user_id, currentGraphData);
          setGraphData(result.graph);
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
      const result = await api.getContextualHelp(inputText || 'Ayuda general', graphData.nodes.length > 0 ? graphData : null, user_id);
      alert(`Sugerencia (RF07):\n\n${result.help}`);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-900 bg-opacity-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">EduMap</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden sm:inline">{userEmail}</span>
             <div className="flex items-center gap-1">
                <button onClick={handleExportPNG} title="Exportar como PNG (RF08)" disabled={!selectedGraph || graphData.nodes.length === 0} className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"> <Save size={20} /> </button>
                <button onClick={handleContextualHelp} title="Ayuda Contextual (RF07)" className="p-2 hover:bg-slate-700 rounded-lg transition-colors"> <HelpCircle size={20} /> </button>
                <button onClick={handleAnalysis} title="Analizar Grafo (RF09)" disabled={!selectedGraph} className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"> <BarChart2 size={20} /> </button>
                <label htmlFor="file-upload" title="Subir Archivo (.txt, .pdf, .mp3, etc.)" className="p-2 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"> <Upload size={20} /> </label>
                <input id="file-upload" type="file" className="hidden" onChange={handleFileUpload}/>
             </div>
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm">
              <LogOut size={16} /> Salir
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
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

            {/* --- INICIO DEL BLOQUE CORREGIDO --- */}
           <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escribe texto, una instrucción (ej: 'Refinar sobre...') o sube un archivo para empezar."
                  className="w-full h-32 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                {error && (<div className="mt-2 text-sm text-red-400">{error}</div>)}
                <button
                  onClick={() => handleGenerateGraph(false)}
                  disabled={loading || !user_id}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (<><Loader2 size={20} className="animate-spin" /> Generando...</>) : (<><Sparkles size={20} /> Generar / Modificar Grafo</>)}
                </button>
              </div>

                <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                    {loading && <div className="flex items-center justify-center h-full text-slate-400"><Loader2 className="animate-spin mr-2"/> Cargando...</div>}
                    {!loading && graphData.nodes.length > 0 ? (
                        <GraphVisualization
                            ref={graphRef}
                            nodes={graphData.nodes}
                            edges={graphData.edges}
                            onNodeClick={handleNodeClick}
                        />
                    ) : (
                       !loading && (
                         <div className="flex items-center justify-center h-full text-slate-400">
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
        />
      )}
    </div>
  );
}