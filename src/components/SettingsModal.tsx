// src/components/SettingsModal.tsx
import { useState } from 'react';
import { X, Save, User, Palette, BarChartHorizontal } from 'lucide-react';
import { Preferences } from '../lib/types';

interface SettingsModalProps {
  // Usamos Partial<Preferences> para manejar el estado inicial por defecto
  currentPreferences: Partial<Preferences>;
  onClose: () => void;
  onSave: (newPreferences: Preferences) => void;
  isLoading: boolean;
}

// Definimos los valores por defecto completos
const defaultPreferences: Preferences = {
  theme: 'dark',
  detail_level: 'detailed',
  persona_type: 'estudiante',
};

export function SettingsModal({
  currentPreferences,
  onClose,
  onSave,
  isLoading,
}: SettingsModalProps) {
  
  // Fusionamos los defaults con lo guardado para asegurar que todos los campos existan
  const initialPrefs = { ...defaultPreferences, ...currentPreferences };

  const [theme, setTheme] = useState(initialPrefs.theme);
  const [detailLevel, setDetailLevel] = useState(initialPrefs.detail_level);
  const [personaType, setPersonaType] = useState(initialPrefs.persona_type);

  const handleSave = () => {
    onSave({
      theme,
      detail_level: detailLevel,
      persona_type: personaType,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col border border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="sticky top-0 bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">Ajustes de Personalización (RF05)</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* 1. User Persona */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-400 uppercase flex items-center gap-2">
              <User size={16} />
              Tu Perfil
            </label>
            <p className="text-sm text-slate-400">
              Selecciona tu perfil para adaptar la ayuda y las sugerencias (CU-04).
            </p>
            <select
              value={personaType}
              onChange={(e) => setPersonaType(e.target.value as Preferences['persona_type'])}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            >
              <option value="estudiante">Estudiante</option>
              <option value="profesor">Profesor</option>
              <option value="investigador">Investigador</option>
            </select>
          </div>

          {/* 2. Tema Visual */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-400 uppercase flex items-center gap-2">
              <Palette size={16} />
              Tema Visual
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['dark', 'light', 'ocean'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`py-2 rounded-lg capitalize ${
                    theme === t
                      ? 'ring-2 ring-blue-500 bg-blue-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Nivel de Detalle */}
           <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-400 uppercase flex items-center gap-2">
              <BarChartHorizontal size={16} />
              Nivel de Detalle
            </label>
            <p className="text-sm text-slate-400">
              Elige cuánto detalle mostrar por defecto en los grafos.
            </p>
            <select
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value as Preferences['detail_level'])}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            >
              <option value="detailed">Detallado (Mostrar todo)</option>
              <option value="simple">Simple (Ocultar descripciones)</option>
            </select>
          </div>

        </div>

        {/* Pie de página */}
        <div className="sticky bottom-0 bg-slate-900 px-6 py-4 flex justify-end gap-3 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={18} />
            {isLoading ? "Guardando..." : "Guardar Preferencias"}
          </button>
        </div>
      </div>
    </div>
  );
}