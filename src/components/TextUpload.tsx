import { useState } from 'react';
import { Upload, FileText } from 'lucide-react';

interface TextUploadProps {
  onTextSubmit: (text: string, title: string) => void;
  isLoading: boolean;
}

export function TextUpload({ onTextSubmit, isLoading }: TextUploadProps) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && title.trim()) {
      onTextSubmit(text, title);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setText(content);
        if (!title) {
          setTitle(file.name.replace('.txt', ''));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Generador de Mapas de Conocimiento
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Título del Mapa
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Introducción a la IA"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-2">
            Texto o Material Educativo
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pega aquí el texto que deseas analizar, o arrastra un archivo .txt..."
            rows={12}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={isLoading}
          />
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50'
          }`}
        >
          <input
            type="file"
            accept=".txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="hidden"
            id="file-upload"
            disabled={isLoading}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <Upload className="w-10 h-10 text-gray-400 mb-2" />
            <span className="text-sm text-gray-600">
              Arrastra un archivo .txt aquí o haz clic para seleccionar
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || !text.trim() || !title.trim()}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Generando Mapa...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5" />
              Generar Mapa de Conocimiento
            </>
          )}
        </button>
      </form>
    </div>
  );
}
