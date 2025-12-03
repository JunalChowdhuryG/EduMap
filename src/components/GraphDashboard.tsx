// src/components/GraphDashboard.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import * as api from '../lib/api';
import { GraphSummary, GraphData, Node as NodeType, Preferences, QuizData, UserProfile } from '../lib/types';
import { GraphVisualization, GraphVisualizationHandle } from './GraphVisualization';
import { NodeDetailModal } from './NodeDetailModal';
import { SettingsModal } from './SettingsModal';
import { QuizModal } from './QuizModal';
import { useGraphTour } from '../lib/useGraphTour';
import {
  Plus, FileText, Sparkles, FocusIcon, RefreshCw, Loader2, Upload,
  Trash2, HelpCircle, BarChart2, Save, LogOut, Settings,
  FileJson, Play, StopCircle, Trophy, Edit3
} from 'lucide-react';
import { Award, GraduationCap, Star } from 'lucide-react';

// Nuevos íconos usados en la UI añadida
import { Search, History, RotateCcw, RotateCw, AlertCircle, X, Check } from 'lucide-react';

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
  // --- ESTADOS ---
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

  // Estados nuevos para Gamificación y Quiz
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  // --- NUEVOS ESTADOS SOLICITADOS ---
  const [searchTerm, setSearchTerm] = useState(''); // Buscador
  const [versions, setVersions] = useState<any[]>([]); // Historial de versiones
  const [isRestoring, setIsRestoring] = useState(false);

  // Estados para Modales Personalizados
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [tempTitle, setTempTitle] = useState('');

  // Mensajes de espera aleatorios para UX
  const loadingMessages = [
    "Conectando neuronas artificiales...",
    "Estructurando el conocimiento...",
    "Analizando relaciones complejas...",
    "Generando visualización..."
  ];
  const [loadingMsg, setLoadingMsg] = useState(loadingMessages[0]);

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
      if (id !== user_id) {
        setUserId(id);
      }
    };
    initUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Cargar Perfil (Gamificación)
  useEffect(() => {
    if (user_id) {
      api.getUserProfile(user_id).then(setUserProfile).catch(console.error);
    }
  }, [user_id]);

  // 3. Configurar acción por defecto según persona
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

  // 6. WebSocket y Carga de Grafo Seleccionado
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
            // Actualizar modal si está abierto
            setModalNode(prevNode => {
              if (prevNode) {
                const updatedNode = data.graph.nodes.find((n: NodeType) => n.id === prevNode.id);
                return updatedNode || null;
              }
              return null;
            });
          }
        } catch (e) { console.error("Error WS:", e); }
      };

      ws.current.onclose = () => { ws.current = null; };
    };

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

    return () => { if (ws.current) ws.current.close(); };
  }, [selectedGraph]);

  // --- NUEVO: Cargar historial de versiones cuando se selecciona un grafo o cambia graphData ---
  useEffect(() => {
    if (!selectedGraph) {
      setVersions([]);
      return;
    }
    const loadVersions = async () => {
      try {
        const data = await api.getGraphVersions(selectedGraph.id);
        setVersions(data.versions || []);
      } catch (err) {
        console.error("Error cargando versiones:", err);
        setVersions([]);
      }
    };
    loadVersions();
  }, [selectedGraph, graphData]);

  // EFECTO: Rotar mensaje de carga
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingMsg(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  // --- HANDLERS ---

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
          break;
        case 'focus':
          if (!currentGraphId || !currentGraphData) { setError('Selecciona un grafo para enfocar'); return; }
          result = await api.expandNode(textToUse, currentGraphId, user_id, currentGraphData, contextFileText);
          setGraphData(result.graph);
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
      link.download = link.download; // Corrección menor
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.message || "No se pudo exportar el JSON."); }
  };

  const handleSaveSettings = async (newPreferences: Preferences) => {
    if (!user_id) { setError("No se puede guardar, sesión no iniciada."); return; }
    setSettingsLoading(true);
    try {
      const data = await api.updatePreferences(user_id, newPreferences);
      setPreferences(data.preferences);
      setShowSettingsModal(false);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar preferencias.");
    } finally { setSettingsLoading(false); }
  };

  const handleDeleteNode = async (nodeToDelete: ModalNode) => {
    if (!user_id || !selectedGraph) { setError("Se requiere sesión y grafo para eliminar."); return; }
    if (!confirm(`¿Estás seguro de que quieres eliminar el nodo "${nodeToDelete.label}"?`)) return;

    setDeleteLoading(true);
    try {
      await api.deleteNode(selectedGraph.id, nodeToDelete.id, user_id);
      setModalNode(null);
    } catch (err: any) {
      setError("Error al eliminar: " + err.message);
    } finally { setDeleteLoading(false); }
  };

  // Mantengo ambas estrategias: la antigua (prompt) y la nueva (modal).
  const handleEditGraph = async () => {
    if (!user_id || !selectedGraph) { setError('Se requiere sesión y grafo para editar.'); return; }
    const currentTitle = selectedGraph.title || '';
    const newTitle = window.prompt('Nuevo título del grafo:', currentTitle);
    if (newTitle === null) return; // cancel
    if (!newTitle.trim()) { setError('El título no puede estar vacío.'); return; }

    setLoading(true); setError('');
    try {
      await api.updateGraphTitle(selectedGraph.id, newTitle, user_id);
      // Actualizar estado local
      setGraphs(prev => prev.map(g => g.id === selectedGraph.id ? { ...g, title: newTitle } : g));
      setSelectedGraph(prev => prev ? { ...prev, title: newTitle } : prev);
    } catch (err: any) {
      setError('Error al actualizar título: ' + (err?.message || String(err)));
    } finally { setLoading(false); }
  };

  const handleDeleteGraph = async () => {
    if (!user_id || !selectedGraph) { setError("Se requiere sesión y grafo para eliminar."); return; }
    if (!confirm(`¿Estás seguro de que quieres eliminar el grafo "${selectedGraph.title || selectedGraph.id}"? Esta acción es irreversible.`)) return;

    setLoading(true);
    try {
      await api.deleteGraph(selectedGraph.id, user_id);
      setGraphs(prev => prev.filter(g => g.id !== selectedGraph.id));
      setSelectedGraph(null);
      setGraphData({ nodes: [], edges: [] });
    } catch (err: any) {
      setError("Error al borrar grafo: " + (err?.message || String(err)));
    } finally { setLoading(false); }
  };

  // --- FUNCIONALIDAD DE VERSIONADO (RESTORE / UNDO) ---
  const handleRestore = async (versionId: string) => {
    if (!selectedGraph) return;
    setIsRestoring(true);
    try {
      const result = await api.restoreVersion(versionId);
      if (result?.graph) {
        setGraphData(result.graph);
      }
    } catch (err: any) {
      setError("Error al restaurar versión: " + (err?.message || String(err)));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleUndo = () => {
    // Restaurar la penúltima versión (la última es la actual)
    if (versions.length < 2) return;
    const previousVersion = versions[versions.length - 2];
    handleRestore(previousVersion.id);
  };

  // --- NUEVOS HANDLERS DE GESTIÓN (modales) ---
  const confirmDeleteGraph = async () => {
    if (!selectedGraph || !user_id) return;
    setLoading(true);
    try {
      await api.deleteGraph(selectedGraph.id, user_id);
      setGraphs(prev => prev.filter(g => g.id !== selectedGraph!.id));
      setSelectedGraph(null);
      setGraphData({ nodes: [], edges: [] });
      setShowDeleteModal(false);
    } catch (err: any) {
      setError(err.message || 'Error al eliminar grafo');
    } finally { setLoading(false); }
  };

  const confirmRenameGraph = async () => {
    if (!selectedGraph || !user_id || !tempTitle.trim()) return;
    setLoading(true);
    try {
      await api.updateGraphTitle(selectedGraph.id, tempTitle, user_id);
      setGraphs(prev => prev.map(g => g.id === selectedGraph.id ? { ...g, title: tempTitle } : g));
      setSelectedGraph(prev => prev ? { ...prev, title: tempTitle } : prev);
      setShowRenameModal(false);
    } catch (err: any) {
      setError(err.message || 'Error renombrando grafo');
    } finally { setLoading(false); }
  };

  // --- Handlers para Quiz ---
  const handleStartQuiz = async () => {
    if (!selectedGraph) return;
    setQuizLoading(true);
    try {
      const data = await api.generateQuiz(selectedGraph.id);
      setQuizData(data);
      setShowQuiz(true);
    } catch (e: any) {
      setError("No se pudo generar el quiz: " + e.message);
    } finally { setQuizLoading(false); }
  };

  const handleQuizComplete = async (score: number, total: number) => {
    if (!user_id) return;
    const xpGained = score * 20;
    try {
      const newStats = await api.updateUserStats(user_id, xpGained);
      setUserProfile(newStats);
    } catch (e) { console.error("Error actualizando stats", e); }
  };

  // --- LÓGICA DEL BUSCADOR ---
  const filteredGraphs = useMemo(() => {
    if (!searchTerm.trim()) return graphs;
    return graphs.filter(g =>
      (g.title || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [graphs, searchTerm]);

  // --- RENDER ---
  const themeClass = preferences.theme === 'light' ? 'theme-light' : 'theme-dark';
  const personaClass = `persona-${preferences.persona_type}`;

  return (
    <div className={`min-h-screen bg-gradient-to-br ${themeClass} ${personaClass}`}>
      {/* HEADER */}
      <header className="border-b border-theme-border bg-theme-header-bg bg-opacity-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-theme-accent">
            EduMap <span className="text-sm font-normal text-theme-text-secondary ml-2 capitalize">({preferences.persona_type})</span>
          </h1>

          {/* PERFIL VISUAL (Gamificación) */}
          {userProfile && (
            <div className="hidden md:flex items-center gap-4 bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700">
              <div className="flex items-center gap-1 text-yellow-400" title="Nivel">
                <Star size={16} fill="currentColor" />
                <span className="font-bold">NVL {userProfile.level}</span>
              </div>
              <div className="h-4 w-px bg-slate-600"></div>
              <div className="flex items-center gap-1 text-blue-300" title="Puntos de Experiencia">
                <Award size={16} />
                <span>{userProfile.xp} XP</span>
              </div>
              <div className="h-4 w-px bg-slate-600"></div>
              <div className="flex items-center gap-1 text-green-300" title="Grafos Creados">
                <GraduationCap size={16} />
                <span>{userProfile.graphs_created}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1">
                <button onClick={() => setShowSettingsModal(true)} title="Ajustes (RF05)" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon"> <Settings size={20} /> </button>

                {(preferences.persona_type === 'profesor' || preferences.persona_type === 'investigador') && (
                  <>
                    <button onClick={handleExportJSON} title="Exportar JSON (RF08)" disabled={!selectedGraph || graphData.nodes.length === 0} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <FileJson size={20} /> </button>
                    <button onClick={handleExportPNG} title="Exportar PNG (RF08)" disabled={!selectedGraph || graphData.nodes.length === 0} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <Save size={20} /> </button>
                  </>
                )}

                {(preferences.persona_type === 'estudiante' || preferences.persona_type === 'profesor') && (
                  <>
                    <button onClick={handleContextualHelp} title="Ayuda Contextual (RF07)" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon"> <HelpCircle size={20} /> </button>
                    <button onClick={() => (isTouring ? stopTour() : startTour())} title={isTouring ? "Detener Recorrido" : "Iniciar Recorrido Narrado"} disabled={!selectedGraph || graphData.nodes.length === 0} className={`p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50 ${isTouring ? 'text-red-400' : ''}`}> {isTouring ? <StopCircle size={20} /> : <Play size={20} />} </button>
                  </>
                )}

                {preferences.persona_type === 'investigador' && (
                  <button onClick={handleAnalysis} title="Analizar Grafo (RF09)" disabled={!selectedGraph} className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50"> <BarChart2 size={20} /> </button>
                )}

                {/* BOTÓN DE QUIZ */}
                <button onClick={handleStartQuiz} disabled={!selectedGraph || quizLoading} title="Iniciar Evaluación" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon disabled:opacity-50 text-yellow-400"> {quizLoading ? <Loader2 className="animate-spin" size={20}/> : <Trophy size={20} />} </button>

                <label htmlFor="file-upload" title="Subir Archivo" className="p-2 hover:bg-theme-hover rounded-lg transition-colors text-theme-icon cursor-pointer"> <Upload size={20} /> </label>
                <input id="file-upload" type="file" className="hidden" onChange={handleFileUpload}/>
             </div>
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 bg-theme-secondary-bg hover:bg-theme-hover rounded-lg transition-colors text-sm text-theme-text-secondary">
              <LogOut size={16} /> Salir
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="max-w-7xl mx-auto px-4 py-6 text-theme-text-primary">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
           {/* BARRA LATERAL */}
           <div className="lg:col-span-1 space-y-4 overflow-auto">
             <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border">
                <h2 className="text-lg font-semibold mb-4">Grafos de esta Sesión</h2>

                {/* Buscador */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    placeholder="Buscar grafo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-theme-input-bg border border-theme-border rounded-md text-sm text-theme-text-primary focus:ring-1 focus:ring-theme-accent outline-none"
                  />
                  <Search className="absolute left-3 top-2.5 text-theme-text-secondary w-4 h-4" />
                </div>

                 {loading && graphs.length === 0 && <p className="text-sm text-slate-400">Cargando...</p>}
                 {!loading && graphs.length === 0 && !error && <p className="text-sm text-slate-500">Crea tu primer grafo.</p>}
                 {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="space-y-2 mt-2 max-h-[320px] overflow-y-auto">
                    {filteredGraphs.map((graph) => (
                    <button
                      key={graph.id}
                      onClick={() => setSelectedGraph(graph)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedGraph?.id === graph.id
                          ? 'bg-theme-accent text-white'
                          : (preferences.theme === 'light'
                              ? 'bg-slate-100 hover:bg-slate-200 text-theme-text-primary'
                              : 'bg-slate-700 hover:bg-slate-600 text-white')
                      }`}
                    >
                        <div className="font-medium truncate">{graph.title || 'Grafo sin título'}</div>
                    </button>
                    ))}
                    {filteredGraphs.length === 0 && <p className="text-xs text-center text-slate-500 py-2">No se encontraron grafos</p>}
                </div>
             </div>

             <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border">
                   <h3 className="text-sm font-semibold mb-3">Tipo de Acción</h3>
                   <div className="space-y-2">
                      <button
                        onClick={() => setActionType('create')}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          actionType === 'create'
                            ? 'bg-theme-accent text-white'
                            : (preferences.theme === 'light'
                                ? 'bg-slate-100 hover:bg-slate-200 text-theme-text-primary'
                                : 'bg-slate-700 hover:bg-slate-600 text-white')
                        }`}
                      > <Plus size={16} /> Crear Nuevo </button>
                      <button
                        onClick={() => setActionType('add_content')}
                        disabled={!selectedGraph}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          actionType === 'add_content'
                            ? 'bg-theme-accent text-white'
                            : (preferences.theme === 'light'
                                ? 'bg-slate-100 hover:bg-slate-200 text-theme-text-primary'
                                : 'bg-slate-700 hover:bg-slate-600 text-white')
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      > <FileText size={16} /> Añadir Contenido </button>
                      <button
                        onClick={() => setActionType('refine')}
                        disabled={!selectedGraph}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          actionType === 'refine'
                            ? 'bg-theme-accent text-white'
                            : (preferences.theme === 'light'
                                ? 'bg-slate-100 hover:bg-slate-200 text-theme-text-primary'
                                : 'bg-slate-700 hover:bg-slate-600 text-white')
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      > <RefreshCw size={16} /> Refinar (Feedback) </button>
                      <button
                        onClick={() => setActionType('focus')}
                        disabled={!selectedGraph}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          actionType === 'focus'
                            ? 'bg-theme-accent text-white'
                            : (preferences.theme === 'light'
                                ? 'bg-slate-100 hover:bg-slate-200 text-theme-text-primary'
                                : 'bg-slate-700 hover:bg-slate-600 text-white')
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      > <FocusIcon size={16} /> Enfocar Tópico </button>
                      <button
                        onClick={handleEditGraph}
                        disabled={!selectedGraph}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          preferences.theme === 'light'
                            ? 'bg-slate-100 hover:bg-slate-200 text-theme-text-primary'
                            : 'bg-slate-700 hover:bg-slate-600 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      > <Edit3 size={16} /> Editar Título </button>
                      <button
                        onClick={handleDeleteGraph}
                        disabled={!selectedGraph}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          preferences.theme === 'light'
                            ? 'bg-red-100 hover:bg-red-200 text-red-700'
                            : 'bg-red-700 hover:bg-red-600 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      > <Trash2 size={16} /> Borrar Grafo </button>
                   </div>
              </div>
           </div>

           {/* ÁREA PRINCIPAL */}
           <div className="lg:col-span-3 flex flex-col gap-4">
              {/* Barra superior del grafo: Undo/Redo, versiones, rename/delete (con modales) */}
              <div className="flex justify-between items-center bg-theme-secondary-bg p-2 rounded-lg border border-theme-border">
                 <div className="flex items-center gap-2">
                    <button
                      onClick={handleUndo}
                      disabled={versions.length < 2 || isRestoring}
                      className="p-2 hover:bg-theme-hover rounded text-theme-text-primary disabled:opacity-30"
                      title="Deshacer (Volver a versión anterior)"
                    >
                      <RotateCcw size={18} />
                    </button>
                    <button
                      disabled={true}
                      className="p-2 hover:bg-theme-hover rounded text-theme-text-primary disabled:opacity-30"
                      title="Rehacer (no implementado)"
                    >
                      <RotateCw size={18} />
                    </button>
                    <span className="text-xs text-slate-500 ml-2">
                      {versions.length} versiones guardadas
                    </span>
                 </div>

                 <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setTempTitle(selectedGraph?.title || ''); setShowRenameModal(true); }}
                      disabled={!selectedGraph}
                      className="p-2 hover:bg-blue-900/30 text-blue-400 rounded transition-colors"
                      title="Renombrar Grafo"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      disabled={!selectedGraph}
                      className="p-2 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                      title="Eliminar Grafo"
                    >
                      <Trash2 size={18} />
                    </button>
                 </div>
              </div>

              <div className="bg-theme-secondary-bg rounded-lg p-4 border border-theme-border">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escribe texto, una instrucción (ej: 'Refinar sobre...') o sube un archivo para empezar."
                  className="w-full h-32 px-4 py-3 bg-theme-input-bg border border-theme-border rounded-lg text-theme-text-primary placeholder-theme-text-secondary focus:outline-none focus:ring-2 ring-theme-accent resize-none"
                />
                {error && (<div className="mt-2 text-sm text-red-400">{error}</div>)}
                <button
                  onClick={() => handleGenerateGraph(false)}
                  disabled={loading || !user_id}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-theme-accent hover:bg-theme-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white"
                >
                  {loading ? (<><Loader2 size={20} className="animate-spin" /> Generando...</>) : (<><Sparkles size={20} /> Generar / Modificar Grafo</>)}
                </button>
              </div>

                <div className="flex-1 bg-theme-secondary-bg rounded-lg border border-theme-border overflow-auto min-h-0 relative">
                  {/* NUEVO: PANTALLA DE CARGA MEJORADA */}
                  {(loading || isRestoring) && (
                    <div className="absolute inset-0 z-50 bg-theme-secondary-bg/90 backdrop-blur-sm flex flex-col items-center justify-center text-theme-text-primary">
                      <Loader2 className="w-12 h-12 animate-spin text-theme-accent mb-4" />
                      <p className="text-lg font-medium animate-pulse">{loadingMsg}</p>
                      <p className="text-sm text-theme-text-secondary mt-2">Por favor espera...</p>
                    </div>
                  )}

                    {loading && <div className="flex items-center justify-center h-full text-theme-text-secondary"><Loader2 className="animate-spin mr-2"/> Cargando...</div>}
                    {!loading && graphData.nodes.length > 0 ? (
                        <div className="w-full h-full min-h-0">
                          <GraphVisualization
                              ref={graphRef}
                              nodes={graphData.nodes}
                              edges={graphData.edges}
                              onNodeClick={handleNodeClick}
                              detailLevel={preferences.detail_level}
                              theme={preferences.theme}
                              highlightNodeId={currentNodeId}
                          />
                        </div>
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
        </div>
      </div>

      {/* MODALES */}
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
      {showSettingsModal && (
        <SettingsModal
          currentPreferences={preferences}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveSettings}
          isLoading={settingsLoading}
        />
       )}
      {showQuiz && quizData && (
        <QuizModal
          quizData={quizData}
          onClose={() => setShowQuiz(false)}
          onComplete={handleQuizComplete}
        />
      )}

      {/* --- MODAL ELIMINAR (MEJORADO) --- */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-500/30 rounded-xl shadow-2xl max-w-md w-full p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Grafo?</h3>
                <p className="text-slate-300 text-sm mb-4">
                  Estás a punto de eliminar <strong>"{selectedGraph?.title}"</strong>.
                  Esta acción borrará todas las versiones y nodos asociados y no se puede deshacer.
                </p>
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDeleteGraph}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shadow-lg shadow-red-900/20 transition-all"
                  >
                    Sí, eliminar definitivamente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL RENOMBRAR --- */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Renombrar Grafo</h3>
              <button onClick={() => setShowRenameModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>

            <input
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none mb-6"
              autoFocus
            />

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRenameModal(false)} className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg">Cancelar</button>
              <button onClick={confirmRenameGraph} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2">
                <Check size={18} /> Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
