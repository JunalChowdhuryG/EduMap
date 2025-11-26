import { useState } from 'react';
import { X, CheckCircle, XCircle, Trophy } from 'lucide-react';
import { QuizData } from '../lib/types';

interface QuizModalProps {
  quizData: QuizData;
  onClose: () => void;
  onComplete: (score: number, total: number) => void;
}

export function QuizModal({ quizData, onClose, onComplete }: QuizModalProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const handleSelect = (questionId: number, option: string) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = () => {
    let correctCount = 0;
    quizData.questions.forEach(q => {
      if (answers[q.id] === q.correctAnswer) {
        correctCount++;
      }
    });
    setScore(correctCount);
    setSubmitted(true);
    onComplete(correctCount, quizData.questions.length);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-600">
        
        <div className="sticky top-0 bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center rounded-t-lg">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy className="text-yellow-500" /> Evaluación de Conocimientos
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          {quizData.questions.map((q, idx) => (
            <div key={q.id} className="space-y-3">
              <p className="text-white font-medium text-lg">{idx + 1}. {q.question}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt) => {
                  const isSelected = answers[q.id] === opt;
                  const isCorrect = q.correctAnswer === opt;
                  let btnClass = "p-3 rounded-lg text-left transition-all border ";
                  
                  if (submitted) {
                    if (isCorrect) btnClass += "bg-green-900/50 border-green-500 text-green-100";
                    else if (isSelected && !isCorrect) btnClass += "bg-red-900/50 border-red-500 text-red-100";
                    else btnClass += "bg-slate-700 border-slate-600 text-slate-400 opacity-50";
                  } else {
                    if (isSelected) btnClass += "bg-blue-600 border-blue-500 text-white";
                    else btnClass += "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600";
                  }

                  return (
                    <button
                      key={opt}
                      onClick={() => handleSelect(q.id, opt)}
                      className={btnClass}
                    >
                      <div className="flex justify-between items-center">
                        <span>{opt}</span>
                        {submitted && isCorrect && <CheckCircle size={16} className="text-green-400" />}
                        {submitted && isSelected && !isCorrect && <XCircle size={16} className="text-red-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-900 border-t border-slate-700 rounded-b-lg flex justify-between items-center">
          {submitted ? (
            <div className="text-white">
              Resultado: <span className="text-yellow-400 font-bold text-xl">{score} / {quizData.questions.length}</span>
              <span className="text-slate-400 text-sm ml-2">(+{score * 20} XP ganados)</span>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Responde todas las preguntas</p>
          )}
          
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={Object.keys(answers).length !== quizData.questions.length}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-bold"
            >
              Enviar Respuestas
            </button>
          ) : (
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}