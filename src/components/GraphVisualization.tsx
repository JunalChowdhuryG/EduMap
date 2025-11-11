// src/components/GraphVisualization.tsx
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ForceGraph2D, {
  ForceGraphMethods,
  NodeObject,
  LinkObject
} from 'react-force-graph-2d';
import { Node, Edge, Preferences } from '../lib/types';

interface GraphNode {
  id: string;
  label: string;
  description?: string;
  node_type: string;
  color?: string;
  val: number;
  comments?: any[];
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  label?: string;
  relationship_type: string;
}

interface GraphVisualizationProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
  detailLevel: Preferences['detail_level'];
  theme: Preferences['theme'];
  highlightNodeId: string | null;
}

export interface GraphVisualizationHandle {
  exportToPNG: (scale?: number) => void;
}

export const GraphVisualization = forwardRef<GraphVisualizationHandle, GraphVisualizationProps>(
  ({ nodes, edges, onNodeClick, detailLevel, theme, highlightNodeId }, ref) => {
    const fgRef = useRef<
      ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>> | undefined
    >(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });

    const exportToPNG = (scale = 2) => {
      const canvas = containerRef.current?.querySelector('canvas');
      if (!canvas) {
        alert('Canvas no encontrado. Espera a que el grafo se renderice.');
        return;
      }

      const width = canvas.width;
      const height = canvas.height;

      const tmp = document.createElement('canvas');
      tmp.width = width * scale;
      tmp.height = height * scale;
      const ctx = tmp.getContext('2d');
      if (!ctx) return;

      // Fondo (opcional)
      ctx.fillStyle = theme === 'light' ? '#ffffff' : '#0f172a';
      ctx.fillRect(0, 0, tmp.width, tmp.height);

      // Dibuja el contenido escalado
      ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);

      // Exportar
      const dataUrl = tmp.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'grafo.png';
      link.click();
    };
    useImperativeHandle(ref, () => ({
      exportToPNG
    }));

    // Generar datos
    useEffect(() => {
      const graphNodes: GraphNode[] = nodes.map((node) => ({
        id: node.id,
        label: node.label,
        description: node.description,
        node_type: node.type,
        color: node.color,
        val: 10,
        comments: node.comments || []
      }));
      const graphLinks: GraphLink[] = edges.map((edge) => ({
        source: edge.from,
        target: edge.to,
        label: edge.label,
        relationship_type: edge.label || 'related_to'
      }));
      setGraphData({ nodes: graphNodes, links: graphLinks });
    }, [nodes, edges]);

    // Ajustes físicos
    useEffect(() => {
      const fg = fgRef.current;
      if (!fg) return;
      try {
        const chargeForce = fg.d3Force('charge');
        if (chargeForce) chargeForce.strength(-400);
        const linkForce = fg.d3Force('link') as any;
        if (linkForce) linkForce.distance(100);
        fg.d3ReheatSimulation();
      } catch (err) {
        console.error('Error configurando fuerzas:', err);
      }
    }, [graphData]);

    const linkColor = theme === 'light' ? '#475569' : '#64748b';
    const backgroundColor = theme === 'light' ? '#f1f5f9' : '#0f172a';
    const nodeTextColor = theme === 'light' ? '#020617' : '#ffffff';

    const getNodeColor = (node: GraphNode) => {
      const colors: Record<string, string> = {
        concepto_principal: '#FFB347',
        concepto_secundario: '#77DD77',
        entidad: '#AEC6CF',
        detalle: '#B39EB5',
        other: '#6b7280'
      };
      return node.color || colors[node.node_type] || colors.other;
    };

    const handleNodeClickInternal = (nodeInterno: GraphNode) => {
      const nodoOriginal = nodes.find((n) => n.id === nodeInterno.id);
      if (onNodeClick && nodoOriginal) onNodeClick(nodoOriginal);
    };

    return (
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden">
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          graphData={graphData}
          nodeLabel={(node) =>
            detailLevel === 'simple'
              ? node.label
              : `${node.label}${node.description ? `\n\n${node.description}` : ''}`
          }
          nodeColor={(node) => getNodeColor(node)}
          nodeRelSize={6}
          linkLabel={(link) => link.label || link.relationship_type}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          linkCurvature={0.15}
          linkColor={() => linkColor}
          backgroundColor={backgroundColor}
          onNodeClick={handleNodeClickInternal}
          nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.label || 'NODO';
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;

          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const radius = node.val / 2 || 6;

          // --- LÓGICA DE RESALTADO ---
          if (node.id === highlightNodeId) {
            // Dibuja un "brillo" exterior
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(255, 255, 0, 0.7)"; // Amarillo brillante
            ctx.fillStyle = '#FFFF00'; // Relleno amarillo
          } else {
            ctx.fillStyle = getNodeColor(node);
          }
          // --- FIN LÓGICA DE RESALTADO ---

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.fill();

          // Resetear sombra para que el texto no brille
          ctx.shadowBlur = 0;

          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = nodeTextColor;
          ctx.fillText(label, x, y + radius + 2);
        }}
        />
      </div>
    );
  }
);
