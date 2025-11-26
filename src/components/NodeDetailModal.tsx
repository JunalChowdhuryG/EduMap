// src/components/NodeDetailModal.tsx
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
  onExpandNode: (node: Node, contextFileText?: string) => void; // Firma modificada
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

  // --- Nuevos estados para carga de archivo ---
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!node) return null;

  // Reproducir / detener descripción
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

  // Añadir comentario
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

  // Subir archivo y extraer texto
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await api.uploadFile(file);
      if (result.extracted_text) {
        setFileContext(result.extracted_text);
        alert('Archivo procesado correctamente. El contenido se usará al expandir el nodo.');
      }
    } catch (err) {
      alert('Error al subir el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">{node.label}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDeleteNode(node)}
              disabled={isDeleting}
              title="Eliminar este nodo"
              className="p-1 hover:bg-red-900/50 rounded-full transition-colors text-red-500 hover:text-red-400"
            >
              {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* === Herramientas de Expansión === */}
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <ZoomIn size={16} /> Herramientas de Expansión
            </h4>

            <div className="flex flex-col gap-3">
              {/* Subir archivo */}
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
                  {isUploading ? (
                    <Loader2 className="animate-spin w-4 h-4" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {fileContext ? 'Archivo Cargado (Listo para usar)' : 'Subir documento para expandir'}
                </button>
              </div>

              {/* Botón principal de expansión */}
              <button
                onClick={() => onExpandNode(node, fileContext || undefined)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
              >
                {fileContext ? <FileText size={18} /> : <ZoomIn size={18} />}
                {fileContext ? 'Expandir usando Documento' : 'Expandir este Nodo (IA General)'}
              </button>
            </div>
          </div>

          {/* Tipo de Concepto */}
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

          {/* Descripción con botón de audio */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-slate-400 uppercase">Descripción</h4>
              {node.description && (
                <button
                  onClick={handlePlayAudio}
                  title={isPlaying ? 'Detener' : 'Reproducir descripción'}
                  className="p-1 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                  {isPlaying ? <StopCircle className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              )}
            </div>
            <p className="text-slate-300 leading-relaxed">
              {node.description || 'Sin descripción.'}
            </p>
          </div>

          {/* Comentarios */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              Comentarios ({node.comments?.length || 0})
            </h4>
            <div className="space-y-3 max-h-40 overflow-y-auto bg-slate-900 p-3 rounded-lg">
              {node.comments && node.comments.length > 0 ? (
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
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400"
              />
              <button
                onClick={handleAddComment}
                disabled={commentLoading || !commentText.trim()}
                className="p-2 w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
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