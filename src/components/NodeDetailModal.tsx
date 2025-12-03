import { useState, useRef } from 'react';
import {
  X,
  Send,
  Loader2,
  ZoomIn,
  Volume2,
  StopCircle,
  Trash2,
  FileText,
  Upload,
} from 'lucide-react';
import { Node } from '../lib/types';
import * as api from '../lib/api';

interface NodeDetailModalProps {
  node: Node | null;
  onClose: () => void;
  onExpandNode: (node: Node, contextFileText?: string) => void;
  onAddComment: (text: string) => Promise<void>;
  onDeleteNode: (node: Node) => Promise<void>;
  isDeleting: boolean;
}

export function NodeDetailModal({
  node,
  onClose,
  onExpandNode,
  onAddComment,
  onDeleteNode,
  isDeleting,
}: NodeDetailModalProps) {
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- EXPANSIÓN MEJORADA ---
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [manualContext, setManualContext] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!node) return null;

  // --- AUDIO ---
  const handlePlayAudio = () => {
    if (!node.description || !window.speechSynthesis) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(node.description);
      utterance.lang = 'es-ES';

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  // --- COMENTARIOS ---
  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      await onAddComment(commentText);
      setCommentText('');
    } catch (error) {
      console.error('Error al añadir comentario:', error);
    } finally {
      setCommentLoading(false);
    }
  };

  // --- SUBIR ARCHIVO ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await api.uploadFile(file);
      if (result.extracted_text) {
        setFileContext(result.extracted_text);
        alert('Archivo procesado correctamente.');
      }
    } catch (err) {
      alert('Error al subir el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  // --- EXPANDIR COMBINANDO CONTEXTO ---
  const handleExpandClick = () => {
    let finalContext = '';

    if (manualContext.trim()) {
      finalContext += `Instrucciones/Contexto Manual:\n${manualContext}\n`;
    }

    if (fileContext) {
      finalContext += `\nContenido del Archivo:\n${fileContext}`;
    }

    onExpandNode(node, finalContext.trim() || undefined);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="sticky top-0 bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">{node.label}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDeleteNode(node)}
              disabled={isDeleting}
              className="p-1 hover:bg-red-900/50 rounded-full transition-colors text-red-500"
            >
              {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-full">
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </div>

        {/* CONTENIDO */}
        <div className="p-6 space-y-6 overflow-y-auto">

          {/* === EXPANSIÓN MEJORADA === */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <ZoomIn size={16} /> Herramientas de Expansión
            </h4>

            <div className="flex flex-col gap-3">

              {/* TEXTO MANUAL */}
              <textarea
                value={manualContext}
                onChange={(e) => setManualContext(e.target.value)}
                placeholder="Escribe aquí instrucciones específicas para expandir este nodo..."
                className="w-full h-24 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
              />

              {/* ARCHIVO */}
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.txt,.md,.docx"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`flex-1 py-2 px-3 rounded border border-dashed text-sm transition-colors flex items-center justify-center gap-2 ${
                    fileContext
                      ? 'bg-green-900/20 border-green-500 text-green-400'
                      : 'border-slate-500 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {fileContext ? 'Archivo Adjunto (Listo)' : 'Adjuntar documento (Opcional)'}
                </button>

                {fileContext && (
                  <button
                    onClick={() => setFileContext(null)}
                    className="p-2 text-red-400 hover:bg-slate-700 rounded border border-slate-600"
                    title="Quitar archivo"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* BOTÓN PRINCIPAL */}
              <button
                onClick={handleExpandClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
              >
                <ZoomIn size={18} />
                {(fileContext || manualContext)
                  ? 'Expandir con Contexto Personalizado'
                  : 'Expandir usando IA General'}
              </button>
            </div>
          </div>

          {/* TIPO */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">Tipo de Concepto</h4>
            <span
              className="inline-block px-3 py-1 rounded-full text-sm font-medium"
              style={{
                backgroundColor: node.color ? `${node.color}30` : '#3b82f630',
                color: node.color || '#3b82f6',
                border: `1px solid ${node.color || '#3b82f6'}`,
              }}
            >
              {node.type}
            </span>
          </div>

          {/* DESCRIPCIÓN */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-slate-400 uppercase">Descripción</h4>
              {node.description && (
                <button
                  onClick={handlePlayAudio}
                  className="p-1 hover:bg-slate-700 rounded-full text-slate-400"
                >
                  {isPlaying ? <StopCircle className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              )}
            </div>
            <p className="text-slate-300 leading-relaxed">
              {node.description || 'Sin descripción.'}
            </p>
          </div>

          {/* COMENTARIOS */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              Comentarios ({node.comments?.length || 0})
            </h4>

            <div className="space-y-3 max-h-40 overflow-y-auto bg-slate-900 p-3 rounded-lg">
              {node.comments?.length ? (
                node.comments.map((comment, index) => (
                  <div key={index} className="text-sm p-2 bg-slate-700 rounded">
                    <p className="text-slate-300">{comment.text}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Usuario: {comment.user_id.substring(0, 8)}...
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No hay comentarios.</p>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Añadir un comentario..."
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
              <button
                onClick={handleAddComment}
                disabled={commentLoading || !commentText.trim()}
                className="p-2 w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {commentLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
