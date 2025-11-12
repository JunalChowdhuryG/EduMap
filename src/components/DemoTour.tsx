// src/components/DemoTour.tsx
import React, { useLayoutEffect, useState, RefObject } from 'react';

interface DemoTourProps {
  demoStep: number;
  onNext: () => void;
  onStop: () => void;
  targetRef: RefObject<HTMLElement>;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function DemoTour({
  demoStep,
  onNext,
  onStop,
  targetRef,
  text,
  position = 'bottom',
}: DemoTourProps) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  // Calcula la posición del pop-up al lado del elemento resaltado
  useLayoutEffect(() => {
    if (targetRef.current) {
      const rect = targetRef.current.getBoundingClientRect();
      let newStyle: React.CSSProperties = {};

      switch (position) {
        case 'top':
          newStyle = { top: rect.top - 10, left: rect.left, transform: 'translateY(-100%)' };
          break;
        case 'left':
          newStyle = { top: rect.top, left: rect.left - 10, transform: 'translateX(-100%)' };
          break;
        case 'right':
          newStyle = { top: rect.top, left: rect.right + 10 };
          break;
        case 'bottom':
        default:
          newStyle = { top: rect.bottom + 10, left: rect.left };
          break;
      }
      setStyle(newStyle);
    }
  }, [targetRef, position, demoStep]);

  return (
    <div className="demo-popup" style={style}>
      <p className="text-sm mb-4">{text}</p>
      <div className="flex justify-between items-center">
        <button
          onClick={onStop}
          className="text-xs text-gray-600 hover:text-red-600"
        >
          Saltar Demo
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium"
        >
          {demoStep === 3 ? 'Finalizar' : 'Siguiente'}
        </button>
      </div>
    </div>
  );
}