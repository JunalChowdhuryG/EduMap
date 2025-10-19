// src/components/GraphVisualization.tsx
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ForceGraph2D, { ForceGraphMethods, LinkObject } from 'react-force-graph-2d';
import { Node, Edge } from '../lib/types';

interface GraphNode {
  id: string;
  label: string;
  description?: string;
  node_type: string;
  color?: string;
  val: number;
  comments?: any[];
  // Necesitamos asegurar que x, y estén presentes para nodeCanvasObject
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode; // Puede ser ID o el objeto nodo
  target: string | GraphNode; // Puede ser ID o el objeto nodo
  label?: string;
  relationship_type: string;
}

interface GraphVisualizationProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void; // Cambiado para devolver el tipo Node original
}

export interface GraphVisualizationHandle {
  canvasEl: HTMLCanvasElement | undefined;
}

export const GraphVisualization = forwardRef<GraphVisualizationHandle, GraphVisualizationProps>(
  ({ nodes, edges, onNodeClick }, ref) => {

    const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>(); // Tipado más específico

    useImperativeHandle(ref, () => ({
      get canvasEl() {
        // Accedemos a la función del método que devuelve el elemento canvas
        return fgRef.current?.canvasEl();
      }
    }), []);

    const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
      nodes: [],
      links: [],
    });

    useEffect(() => {
      // Mapeo inicial, pero react-force-graph añadirá x, y, etc.
      const graphNodes: GraphNode[] = nodes.map((node) => ({
        id: node.id,
        label: node.label,
        description: node.description || undefined,
        node_type: node.type,
        color: node.color,
        val: 10, // Tamaño base del nodo
        comments: node.comments || [],
        // x, y serán añadidos por la librería
      }));
      const graphLinks: GraphLink[] = edges.map((edge) => ({
        source: edge.from,
        target: edge.to,
        label: edge.label || undefined,
        relationship_type: edge.label || 'related_to',
      }));
      setGraphData({ nodes: graphNodes, links: graphLinks });
    }, [nodes, edges]);


    // --- CORREGIDO: useEffect de Física ---
    useEffect(() => {
        const fg = fgRef.current;
        // Solo ejecutar si fg está definido
        if (fg) {
          try {
            // Asegurarse de que las fuerzas existan antes de configurarlas
            const chargeForce = fg.d3Force('charge');
            if (chargeForce) chargeForce.strength(-400);

            const linkForce = fg.d3Force('link') as any; // Usar 'as any' si el tipo es complejo
            if (linkForce) linkForce.distance(100);

            fg.d3Force('center'); // Esta usualmente no falla
          } catch (error) {
              console.error("Error setting d3 forces:", error)
          }

           // Re-calentar la simulación brevemente para aplicar cambios
           fg.d3ReheatSimulation();
        }
      }, [graphData]); // <- Ejecutar cuando los datos cambien también
      // --- FIN DE CORRECCIÓN ---


    // getNodeColor (sin cambios)
     const getNodeColor = (node: GraphNode) => {
      if (node.color) return node.color;
      const colors: Record<string, string> = {
        'concepto_principal': '#FFB347', 'concepto_secundario': '#77DD77',
        'entidad': '#AEC6CF', 'detalle': '#B39EB5', 'other': '#6b7280',
      };
      return colors[node.node_type] || colors.other;
    };


    // --- CORREGIDO: handleNodeClick (Pasar el objeto Node original) ---
    const handleNodeClickInternal = (nodeInterno: GraphNode) => {
      // Buscar el nodo original en `nodes` usando el id
      const nodoOriginal = nodes.find(n => n.id === nodeInterno.id);
      if (onNodeClick && nodoOriginal) {
          // Devolvemos el nodo original que tiene toda la info de 'types.ts'
        onNodeClick(nodoOriginal);
      }
    };
    // --- FIN DE CORRECCIÓN ---


    return (
      <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden">
        <ForceGraph2D<GraphNode, GraphLink> // Añadir tipos genéricos
          ref={fgRef}
          graphData={graphData}
          nodeLabel={(node) => `${node.label}${node.description ? '\n' + node.description : ''}`}
          nodeColor={(node) => getNodeColor(node)}
          nodeRelSize={6} // Este es el radio base, val puede modificarlo
          linkLabel={(link) => link.label || link.relationship_type}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          linkCurvature={0.15}
          linkColor={() => '#64748b'}
          backgroundColor="#0f172a"
          onNodeClick={handleNodeClickInternal} // <-- Usar la función interna corregida

          // --- CORREGIDO: nodeCanvasObject con validación ---
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.label || 'NODO';
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.fillStyle = getNodeColor(node); // Usa la función helper

            // Dibuja el círculo - ASEGURARSE que x, y son números
            const x = typeof node.x === 'number' ? node.x : 0;
            const y = typeof node.y === 'number' ? node.y : 0;
            const radius = node.val / 2; // Usar node.val para el tamaño si se desea, o un valor fijo como 6

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fill();

            // Dibuja la etiqueta debajo
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'white';
            ctx.fillText(label, x, y + radius + 2);
          }}
          // --- FIN DE CORRECCIÓN ---
        />
      </div>
    );
  }
);