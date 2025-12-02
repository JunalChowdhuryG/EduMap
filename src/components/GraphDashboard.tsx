// src/components/GraphDashboard.tsx
import { useState, useEffect, useRef } from 'react';
import * as api from '../lib/api';
import { GraphSummary, GraphData, Node as NodeType, Preferences, QuizData, UserProfile } from '../lib/types';
import { GraphVisualization, GraphVisualizationHandle } from './GraphVisualization';
import { NodeDetailModal } from './NodeDetailModal';
import { SettingsModal } from './SettingsModal';
import { QuizModal } from './QuizModal';
import { useGraphTour } from '../lib/useGraphTour';
import {
  Plus, FileText, Sparkles, FocusIcon, RefreshCw, Loader2, Upload,
  HelpCircle, BarChart2, Save, LogOut, Settings,
  FileJson, Play, StopCircle, Trophy,
  Search, Trash2, Undo, Redo // <--- Nuevos iconos importados
} from 'lucide-react';
import { Award, GraduationCap, Star } from 'lucide-react';

interface ModalNode extends NodeType {}

interface GraphDashboardProps {
  userEmail: string;
  onLogout: () => void;
}

const defaultPreferences: Preferences = {
  theme: 'dark',
  detail_level: 'detailed',
  persona_type: 'estudiante',
};

export function GraphDashboard({ userEmail, onLogout }: GraphDashboardProps) {
  // --- ESTADOS PRINCIPALES ---
  const [user_id, setUserId] = useState<string | null>(() => sessionStorage.getItem('knowledge_graph_user_id'));
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraph, setSelectedGraph] = useState<GraphSummary | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  
  // Estados de UI y Edición
  const [inputText, setInputText] = useState('');
  const [actionType, setActionType] = useState<'create' | 'refine' | 'add_content' | 'focus'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // --- NUEVOS ESTADOS PARA LAS FUNCIONALIDADES SOLICITADAS ---
  const [searchTerm, setSearchTerm] = useState(''); // Buscador
  const [historyState, setHistoryState] = useState({ can_undo: false, can_redo: false }); // Historial
  const [deleteLoading, setDeleteLoading] = useState(false); // Estado de carga al borrar
  // -----------------------------------------------------------

  // Estados de Modales y Features
  const [modalNode, setModalNode] = useState<ModalNode | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  
  // Gamificación y Quiz
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);

  // Hooks y Refs
  const { startTour, stopTour, isTouring, currentNodeId } = useGraphTour(
    graphData.nodes,
    graphData.edges
  );
  const ws = useRef<WebSocket | null>(null);
  const graphRef = useRef<GraphVisualizationHandle>(null);

  // --- EFECTOS ---

  // 1. Inicializar Usuario
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
      if (id !== user_id) setUserId(id);
    };
    initUser();
  }, []);

  // 2. Cargar Perfil
  useEffect(() => {
    if (user_id) {
      api.getUserProfile(user_id).then(setUserProfile).catch(console.error);
    }
  }, [user_id]);

  // 3. Acción por defecto según perfil
  useEffect(() => {
    switch(preferences.persona_type) {
      case 'estudiante': setActionType('create'); break;
      case 'profesor': setActionType('add_content'); break;
      case 'investigador': setActionType('refine'); break;
    }
  }, [preferences.persona_type]);

  // 4. Cargar Preferencias
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user_id) return;
      try {
        const data = await api.getPreferences(user_id);
        setPreferences({ ...defaultPreferences, ...data.preferences }); 
      } catch (err: any) {
        console.error("Error al cargar preferencias:", err);
      }
    };
    loadPreferences();
  }, [user_id]);

  // 5. Cargar Historial de Grafos
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

  // 6. WebSocket y Carga de Grafo (Incluyendo estado del historial)
  useEffect(() => {
    const connectWebSocket = (graphId: string) => {
      if (ws.current) ws.current.close();
      
      const wsUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000').replace('http', 'ws');
      ws.current = new WebSocket(`${wsUrl}/ws/${graphId}`);

      ws.current.onopen = () => console.log(`WebSocket conectado: ${graphId}`);
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'update' && data.graph) {
            setGraphData(data.graph);
            // Actualizar el modal si está abierto y el nodo cambió
            setModalNode(prev => prev ? data.graph.nodes.find((n: NodeType) => n.id === prev.id) || null : null);
            
            // Actualizar estado del historial si viene en el mensaje WS (opcional, o recargar)
            if (data.history) setHistoryState(data.history);
          }
        } catch (e) { console.error("Error WS:", e); }
      };
      ws.current.onclose = () => { ws.current = null; };
    };

    const loadGraphData = async (graphId: string) => {
      setLoading(true); setError('');
      try {
        // Asumimos que getGraph ahora devuelve { graph: ..., history: { can_undo: bool, can_redo: bool } }
        const data: any = await api.getGraph(graphId); 
        setGraphData(data.graph || { nodes: [], edges: [] });
        
        if (data.history) {
            setHistoryState(data.history);
        }
        
        connectWebSocket(graphId);
      } catch (err: any) {
        setError(err.message || 'Error cargando datos del grafo');
      } finally { setLoading(false); }
    };

    if (selectedGraph) {
      loadGraphData(selectedGraph.id);
    }

    return () => { if (ws.current) ws.current.close(); };
  }, [selectedGraph]);


  // --- HANDLERS ---

  // Filtrado de grafos para el Buscador
  const filteredGraphs = graphs.filter(g => 
    g.title && g.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Eliminar Grafo
  const handleDeleteGraph = async (graphId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar seleccionar el grafo al hacer click en borrar
    if (!confirm("¿Estás seguro de eliminar este grafo permanentemente?")) return;
    if (!user_id) return;

    try {
        // Necesitas implementar deleteGraph en api.ts
        await api.deleteGraph(graphId, user_id); 
        
        // Actualizar lista local
        setGraphs(prev => prev.filter(g => g.id !== graphId));
        
        // Si el grafo borrado era el seleccionado, limpiar selección
        if (selectedGraph?.id === graphId) {
            setSelectedGraph(null);
            setGraphData({ nodes: [], edges: [] });
        }
    } catch (err: any) {
        alert("Error al eliminar: " + err.message);
    }
  };

  // Deshacer
  const handleUndo = async () => {
    if (!selectedGraph) return;
    try {
        // Necesitas implementar undoGraph en api.ts
        const result: any = await api.undoGraph(selectedGraph.id);
        if (result.graph) {
            setGraphData(result.graph);
            // Actualizar estado de botones (puedes pedirlo al backend o inferirlo)
            // Para asegurar consistencia, idealmente el backend devuelve el nuevo estado history
             const status = await api.getGraph(selectedGraph.id); // Refrescar estado completo
             if(status.history) setHistoryState(status.history);
        }
    } catch (err: any) {
        console.error("Error Undo:", err);
    }
  };

  // Rehacer
  const handleRedo = async () => {
    if (!selectedGraph) return;
    try {
        // Necesitas implementar redoGraph en api.ts
        const result: any = await api.redoGraph(selectedGraph.id);
        if (result.graph) {
            setGraphData(result.graph);
             const status = await api.getGraph(selectedGraph.id); // Refrescar estado completo
             if(status.history) setHistoryState(status.history);
        }
    } catch (err: any) {
        console.error("Error Redo:", err);
    }
  };

  const handleNodeClick = (nodeData: NodeType) => { setModalNode(nodeData); };

  const handleGenerateGraph = async (
    isNodeExpansion: boolean = false,
    nodeExpandLabel: string = '',
    contextFileText?: string
  ) => {
    const textToUse = isNodeExpansion ? `Expandir: ${nodeExpandLabel}` : inputText;
    if (!textToUse.trim()) { setError('Por favor, introduce algún texto'); return; }
    if (!user_id) { setError('Usuario no inicializado'); return; }

    setLoading(true); setError('');
    try {
      const currentGraphId = selectedGraph?.id;
      const currentGraphData = (actionType !== 'create' && graphData.nodes.length > 0) ? graphData : null;
      let result: { graph_id: string; graph: GraphData };
      const effectiveActionType = isNodeExpansion ? 'focus' : actionType;

      switch (effectiveActionType) {
        case 'create':
          result = await api.generateGraph(textToUse, user_id, textToUse.substring(0, 100));
          const newSummary = { id: result.graph_id, title: textToUse.substring(0, 100) };
          setGraphs(prev => [...prev, newSummary]);
          setSelectedGraph(newSummary);
          setGraphData(result.graph);
          // Resetear historial al crear nuevo
          setHistoryState({ can_undo: false, can_redo: false });
          break;
        case 'refine':
          if (!currentGraphId) { setError('Selecciona un grafo para refinar'); return; }
          result = await api.refineGraph(textToUse, currentGraphId, user_id);
          setGraphData(result.graph);
          setHistoryState(prev => ({ ...prev, can_undo: true })); // Asumimos que se puede deshacer tras cambio
          break;
        case 'add_content':
          if (!currentGraphId || !selectedGraph) { setError('Selecciona un grafo para añadir contenido'); return; }
          result = await api.generateGraph(textToUse, user_id, selectedGraph.title, currentGraphData);
          setGraphData(result.graph);
          setHistoryState(prev => ({ ...prev, can_undo: true }));
          break;
        case 'focus':
          if (!currentGraphId || !currentGraphData) { setError('Selecciona un grafo para enfocar'); return; }
          result = await api.expandNode(textToUse, currentGraphId, user_id, currentGraphData, contextFileText);
          setGraphData(result.graph);
          setHistoryState(prev => ({ ...prev, can_undo: true }));
          break;
      }
      if (!isNodeExpansion) setInputText('');
    } catch (err: any) { setError(err.message || 'Ocurrió un error'); }
    finally { setLoading(false); }
  };

  // ... (Handlers existentes: FileUpload, Help, Analysis, Export, Settings, DeleteNode, Quiz) ...
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError('');
    try {
      const result = await api.uploadFile(file);
      if (result.extracted_text) setInputText(result.extracted_text);
      if (result.notification) setError(result.notification);
    } catch (err: any) { setError(err.message || 'Error al subir el archivo'); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const handleContextualHelp = async () => {
    if (!user_id) return;
    setLoading(true); setError('');
    try {
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

  const handleExportPNG = () => {
    if (!graphRef.current?.exportToPNG) { setError('El grafo no está listo para exportar.'); return; }
    graphRef.current.exportToPNG();
  };

  const handleExportJSON = async () => {
    if (!selectedGraph) { setError("Por favor, selecciona un grafo para exportar."); return; }
    setError('');
    try {
      const graphJsonData = await api.exportGraph(selectedGraph.id);
      const jsonString = JSON.stringify(graphJsonData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedGraph.title?.replace(/[^a-z0-9]/gi, '_') || 'grafo'}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.message || "No se pudo exportar el JSON."); }
  };

  const handleSaveSettings = async (newPreferences: Preferences) => {
    if (!user_id) return;
    setSettingsLoading(true);
    try {
      const data = await api.updatePreferences(user_id, newPreferences);
      setPreferences(data.preferences);
      setShowSettingsModal(false);
    } catch (err: any) { setError(err.message || "No se pudo guardar preferencias."); }
    finally { setSettingsLoading(false); }
  };

  const handleDeleteNode = async (nodeToDelete: ModalNode) => {
    if (!user_id || !selectedGraph) { setError("Se requiere sesión y grafo para eliminar."); return; }
    if (!confirm(`¿Estás seguro de que quieres eliminar el nodo "${nodeToDelete.label}"?`)) return;

    setDeleteLoading(true);
    try {
      await api.deleteNode(selectedGraph.id, nodeToDelete.id, user_id);
      setModalNode(null);
      setHistoryState(prev => ({ ...prev, can_undo: true })); // Borrar es una acción deshacible
    } catch (err: any) { setError("Error al eliminar: " + err.message); }
    finally { setDeleteLoading(false); }
  };

  const handleStartQuiz = async () => {
    if (!selectedGraph) return;
    setQuizLoading(true);
    try {
      const data = await api.generateQuiz(selectedGraph.id);
      setQuizData(data);
      setShowQuiz(true);
    } catch (e: any) { setError("No se pudo generar el quiz: " + e.message); }
    finally { setQuizLoading(false); }
  };

  const handleQuizComplete = async (score: number, total: number) => {
    if (!user_id) return;
    const xpGained = score * 20;
    try {
      const newStats = await api.updateUserStats(user_id, xpGained);
      setUserProfile(newStats);
    } catch (e) { console.error("Error actualizando stats", e); }
  };

  // --- RENDER ---
  const themeClass = preferences.theme === 'light' ? 'theme-light' : 'theme-dark';
  const personaClass = `persona-${preferences.persona_type}`;

  return (
    <div className={`min-h-screen bg-gradient-to-br ${themeClass} ${personaClass}`}>
      
      {/* HEADER */}
      <header className="border-b border-theme-border bg-theme-header-bg bg-opacity-50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-theme-accent flex items-baseline gap-2">
            EduMap
            <span className="text-sm font-normal text-theme-text-secondary capitalize">
              ({preferences.persona_type})
            </span>
          </h1>

          <div className="flex items-center gap-4">
            {/* PERFIL (Gamificación) */}
            {userProfile && (
              <div className="hidden md:flex items-center gap-4 bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700">
                <div className="flex items-center gap-1 text-yellow-400" title="Nivel">
                  <Star size={16} fill="currentColor" />
                  <span className="font-bold">NVL {userProfile.level}</span>
                </div>
                <div className="h-4 w-px bg-slate-600" />
                <div className="flex items-center gap-1 text-blue-300" title="Experiencia">
                  <Award size={16} />
                  <span>{userProfile.xp} XP</span>
                </div>
                <div className="h-4 w-px bg-slate-600" />
                <div className="flex items-center gap-1 text-green-300" title="Grafos creados">
                  <GraduationCap size={16} />
                  <span>{userProfile.graphs_created}</span>
                </div>
              </div>
            )}

            {/* BARRA DE HERRAMIENTAS SUPERIOR */}
            <div className="flex items-center gap-1">
                <button onClick={() => setShowSettingsModal(true)} title="Ajustes" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon"> <Settings size={20} /> </button>
                
                {/* Botones contextuales según perfil */}
                {(preferences.persona_type === 'profesor' || preferences.persona_type === 'investigador') && (
                  <>
                    <button onClick={handleExportJSON} title="Exportar JSON" disabled={!selectedGraph || graphData.nodes.length === 0} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <FileJson size={20} /> </button>
                    <button onClick={handleExportPNG} title="Exportar PNG" disabled={!selectedGraph || graphData.nodes.length === 0} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <Save size={20} /> </button>
                  </>
                )}

                {(preferences.persona_type === 'estudiante' || preferences.persona_type === 'profesor') && (
                  <>
                    <button onClick={handleContextualHelp} title="Ayuda IA" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon"> <HelpCircle size={20} /> </button>
                    <button onClick={() => (isTouring ? stopTour() : startTour())} title={isTouring ? "Detener Tour" : "Iniciar Tour"} disabled={!selectedGraph || graphData.nodes.length === 0} className={`p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50 ${isTouring ? 'text-red-400' : ''}`}> {isTouring ? <StopCircle size={20} /> : <Play size={20} />} </button>
                  </>
                )}

                {preferences.persona_type === 'investigador' && (
                  <button onClick={handleAnalysis} title="Analizar" disabled={!selectedGraph} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <BarChart2 size={20} /> </button>
                )}

                {/* Quiz y Subida */}
                <button onClick={handleStartQuiz} disabled={!selectedGraph || quizLoading} title="Evaluación (Quiz)" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50 text-yellow-400"> {quizLoading ? <Loader2 className="animate-spin" size={20}/> : <Trophy size={20} />} </button>
                <label htmlFor="file-upload" title="Subir Archivo" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon cursor-pointer"> <Upload size={20} /> </label>
                <input id="file-upload" type="file" className="hidden" onChange={handleFileUpload}/>
            </div>
            
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 bg-theme-secondary-bg hover:bg-theme-hover rounded-lg transition-colors text-sm text-theme-text-secondary border border-theme-border">
              <LogOut size={16} /> Salir
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <div className="max-w-7xl mx-auto px-4 py-6 text-theme-text-primary h-[calc(100vh-80px)]">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
           
           {/* BARRA LATERAL (LISTA DE GRAFOS) */}
           <div className="lg:col-span-1 space-y-4 flex flex-col h-full overflow-hidden">
             
             {/* Sección: Mis Grafos con Buscador */}
             <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border flex-1 flex flex-col min-h-0 shadow-sm">
                <h2 className="text-lg font-semibold mb-3">Mis Grafos</h2>
                
                {/* BUSCADOR */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-theme-input-bg rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-theme-accent text-theme-text-primary border border-theme-border"
                    />
                </div>

                {/* LISTA CON SCROLL */}
                <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {loading && graphs.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Cargando...</p>}
                    {!loading && filteredGraphs.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No se encontraron grafos.</p>}
                    
                    {filteredGraphs.map((graph) => (
                      <div 
                        key={graph.id} 
                        onClick={() => setSelectedGraph(graph)} 
                        className={`group w-full flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border border-transparent ${selectedGraph?.id === graph.id ? 'bg-theme-accent text-white shadow-md' : 'bg-theme-input-bg hover:bg-theme-hover border-theme-border'}`}
                      >
                          <span className="truncate font-medium text-sm flex-1">{graph.title || 'Sin título'}</span>
                          
                          {/* BOTÓN ELIMINAR (Visible en hover) */}
                          <button 
                              onClick={(e) => handleDeleteGraph(graph.id, e)}
                              className={`p-1.5 rounded transition-opacity ${selectedGraph?.id === graph.id ? 'text-white hover:bg-white/20' : 'text-red-400 hover:bg-red-900/30 opacity-0 group-hover:opacity-100'}`}
                              title="Eliminar grafo"
                          >
                              <Trash2 size={14} />
                          </button>
                      </div>
                    ))}
                </div>
             </div>

             {/* Sección: Acciones */}
             <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border shadow-sm shrink-0">
                   <h3 className="text-xs font-semibold uppercase text-theme-text-secondary mb-3 tracking-wider">Acciones</h3>
                   <div className="grid grid-cols-1 gap-2">
                      <button onClick={() => setActionType('create')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${actionType === 'create' ? 'bg-theme-accent text-white' : 'bg-theme-input-bg hover:bg-theme-hover text-theme-text-primary'}`}> <Plus size={16} /> Crear Nuevo </button>
                      <button onClick={() => setActionType('add_content')} disabled={!selectedGraph} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${actionType === 'add_content' ? 'bg-theme-accent text-white' : 'bg-theme-input-bg hover:bg-theme-hover text-theme-text-primary'} disabled:opacity-50`}> <FileText size={16} /> Añadir Contenido </button>
                      <button onClick={() => setActionType('refine')} disabled={!selectedGraph} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${actionType === 'refine' ? 'bg-theme-accent text-white' : 'bg-theme-input-bg hover:bg-theme-hover text-theme-text-primary'} disabled:opacity-50`}> <RefreshCw size={16} /> Refinar / Corregir </button>
                      <button onClick={() => setActionType('focus')} disabled={!selectedGraph} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${actionType === 'focus' ? 'bg-theme-accent text-white' : 'bg-theme-input-bg hover:bg-theme-hover text-theme-text-primary'} disabled:opacity-50`}> <FocusIcon size={16} /> Enfocar Nodo </button>
                   </div>
              </div>
           </div>

           {/* ÁREA PRINCIPAL */}
           <div className="lg:col-span-3 flex flex-col gap-4 h-full min-h-0">
              
              {/* Input de Texto */}
              <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border shadow-sm shrink-0">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    actionType === 'create' ? "Escribe un tema (ej: 'Revolución Francesa') o pega un texto..." :
                    actionType === 'refine' ? "Describe qué quieres corregir en el grafo..." :
                    "Escribe o pega contenido adicional para el grafo..."
                  }
                  className="w-full h-24 px-4 py-3 bg-theme-input-bg border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:ring-2 ring-theme-accent resize-none transition-all text-sm"
                />
                <div className="flex justify-between items-center mt-3">
                    {error ? <div className="text-sm text-red-400">{error}</div> : <div></div>}
                    
                    <button
                      onClick={() => handleGenerateGraph(false)}
                      disabled={loading || !user_id}
                      className="flex items-center gap-2 px-6 py-2 bg-theme-accent hover:bg-theme-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium shadow-md"
                    >
                      {loading ? (<><Loader2 size={18} className="animate-spin" /> Procesando...</>) : (<><Sparkles size={18} /> {actionType === 'create' ? 'Generar Grafo' : 'Actualizar'}</>)}
                    </button>
                </div>
              </div>

              {/* Visualización del Grafo */}
              <div className="flex-1 bg-theme-secondary-bg rounded-lg border border-theme-border overflow-hidden relative shadow-sm min-h-0">
                    
                    {/* --- BARRA FLOTANTE DE HISTORIAL (UNDO/REDO) --- */}
                    {selectedGraph && (
                        <div className="absolute top-4 right-4 z-10 flex gap-2 bg-slate-800/90 backdrop-blur p-1.5 rounded-lg shadow-lg border border-slate-600">
                            <button 
                                onClick={handleUndo} 
                                disabled={!historyState.can_undo} 
                                className="p-2 hover:bg-slate-700 rounded-md disabled:opacity-30 text-slate-200 transition-colors" 
                                title="Deshacer (Ctrl+Z)"
                            >
                                <Undo size={20} />
                            </button>
                            <div className="w-px bg-slate-600 my-1"></div>
                            <button 
                                onClick={handleRedo} 
                                disabled={!historyState.can_redo} 
                                className="p-2 hover:bg-slate-700 rounded-md disabled:opacity-30 text-slate-200 transition-colors" 
                                title="Rehacer (Ctrl+Y)"
                            >
                                <Redo size={20} />
                            </button>
                        </div>
                    )}
                    {/* ----------------------------------------------- */}

                    {!loading && graphData.nodes.length > 0 ? (
                        <GraphVisualization
                            ref={graphRef}
                            nodes={graphData.nodes}
                            edges={graphData.edges}
                            onNodeClick={handleNodeClick}
                            detailLevel={preferences.detail_level}
                            theme={preferences.theme}
                            highlightNodeId={currentNodeId}
                        />
                    ) : (
                       <div className="flex items-center justify-center h-full text-theme-text-secondary bg-theme-input-bg/30">
                            <div className="text-center p-8">
                                {loading ? (
                                    <>
                                        <Loader2 size={48} className="mx-auto mb-4 animate-spin text-theme-accent" />
                                        <p className="text-lg font-medium">La IA está trabajando...</p>
                                        <p className="text-sm opacity-70 mt-2">Esto puede tomar unos segundos.</p>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={48} className="mx-auto mb-4 opacity-30" />
                                        <p className="text-lg">{selectedGraph ? 'Este grafo está vacío.' : 'Selecciona un grafo o crea uno nuevo.'}</p>
                                        <p className="text-sm opacity-70 mt-2">Usa el panel superior para comenzar.</p>
                                    </>
                                )}
                            </div>
                         </div>
                    )}
              </div>
           </div>
        </div>
      </div>

      {/* MODALES */}
      {showSettingsModal && (
        <SettingsModal
          currentPreferences={preferences}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveSettings}
          isLoading={settingsLoading}
        />
       )}

      {modalNode && (
        <NodeDetailModal
          node={modalNode}
          onClose={() => setModalNode(null)}
          onExpandNode={(node, fileContext) => {
            setModalNode(null);
            handleGenerateGraph(true, node.label, fileContext);
          }}
          onAddComment={async (text) => {
            if (!user_id || !selectedGraph) return;
            try {
                 await api.addComment(selectedGraph.id, modalNode.id, text, user_id);
                 const updatedNode = { ...modalNode, comments: [...(modalNode.comments || []), { user_id, text, timestamp: new Date().toISOString() }] };
                 setModalNode(updatedNode);
            } catch (commentError: any) { setError("Error al añadir comentario: " + commentError.message); }
          }}
          onDeleteNode={handleDeleteNode}
          isDeleting={deleteLoading}
        />
      )}

      {showQuiz && quizData && (
        <QuizModal
          quizData={quizData}
          onClose={() => setShowQuiz(false)}
          onComplete={handleQuizComplete}
        />
      )}
    </div>
  );
}