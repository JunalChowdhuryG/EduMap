// src/components/NodeDetailModal.tsx
import { useState } from 'react';
import { X, Send, Loader2, ZoomIn } from 'lucide-react';
import { Node } from '../lib/types'; // Importamos la interfaz Node principal

interface NodeDetailModalProps {
  node: Node | null;
  onClose: () => void;
  onExpandNode: (node: Node) => void; // <-- AÑADIDO (Req 2)
  onAddComment: (text: string) => Promise<void>; // <-- AÑADIDO (Req 6)
}

export function NodeDetailModal({
  node,
  onClose,
  onExpandNode,
  onAddComment,
}: NodeDetailModalProps) {
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  if (!node) return null;

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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="sticky top-0 bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">{node.label}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* --- AÑADIDO: Botón Expandir (Req 2 / RF03) --- */}
          <button
            onClick={() => onExpandNode(node)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
          >
            <ZoomIn size={18} />
            Expandir este Nodo (RF03)
          </button>

          {/* Tipo de Concepto */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              Tipo de Concepto
            </h4>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium`}
              style={{
                backgroundColor: node.color ? `${node.color}30` : '#3b82f630', // Fondo con opacidad
                color: node.color || '#3b82f6', // Color del texto
                border: `1px solid ${node.color || '#3b82f6'}`,
              }}
            >
              {node.type}
            </span>
          </div>

          {/* Descripción */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase mb-2">
              Descripción
            </h4>
            <p className="text-slate-300 leading-relaxed">
              {node.description || 'Sin descripción.'}
            </p>
          </div>

          {/* Comentarios (RF06) */}
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
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddComment}
                disabled={commentLoading}
                className="p-2 w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {commentLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}