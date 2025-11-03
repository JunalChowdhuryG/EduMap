// src/components/GraphVisualization.tsx
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ForceGraph2D, { ForceGraphMethods, LinkObject } from 'react-force-graph-2d';
import { Node, Edge, Preferences } from '../lib/types'; // Importar Preferences

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
  source: string | GraphNode; // Puede ser ID o el objeto nodo
  target: string | GraphNode; // Puede ser ID o el objeto nodo
  label?: string;
  relationship_type: string;
}



interface GraphVisualizationProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
  detailLevel: Preferences['detail_level']; // Nivel de detalle
  theme: Preferences['theme']; // Tema
}

export interface GraphVisualizationHandle {
  canvasEl: HTMLCanvasElement | undefined;
}

export const GraphVisualization = forwardRef<GraphVisualizationHandle, GraphVisualizationProps>(
  ({ nodes, edges, onNodeClick, detailLevel, theme }, ref) => {

    const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();

    useImperativeHandle(ref, () => ({
      // --- INICIO DE LA CORRECCIÓN ---
      // El error estaba aquí: Se quitaron los paréntesis de canvasEl()
      get canvasEl() { return fgRef.current?.canvasEl; }
      // --- FIN DE LA CORRECCIÓN ---
    }), []);

    const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });

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


    // useEffect de Física (sin cambios)
    useEffect(() => {
        const fg = fgRef.current;
        if (fg) {
          try {
            const chargeForce = fg.d3Force('charge');
            if (chargeForce) chargeForce.strength(-400);
            const linkForce = fg.d3Force('link') as any;
            if (linkForce) linkForce.distance(100);
            fg.d3Force('center');
          } catch (error) {
              console.error("Error setting d3 forces:", error)
          }
           fg.d3ReheatSimulation();
        }
      }, [graphData]);


    // getNodeColor (sin cambios)
     const getNodeColor = (node: GraphNode) => {
      if (node.color) return node.color;
      const colors: Record<string, string> = {
        'concepto_principal': '#FFB347', 'concepto_secundario': '#77DD77',
        'entidad': '#AEC6CF', 'detalle': '#B39EB5', 'other': '#6b7280',
      };
      return colors[node.node_type] || colors.other;
    };


    // handleNodeClickInternal (sin cambios)
    const handleNodeClickInternal = (nodeInterno: GraphNode) => {
      const nodoOriginal = nodes.find(n => n.id === nodeInterno.id);
      if (onNodeClick && nodoOriginal) {
        onNodeClick(nodoOriginal);
      }
    };

    // Variables de Tema (sin cambios)
    const linkColor = theme === 'light' ? '#475569' : '#64748b';
    const backgroundColor = theme === 'light' ? '#f1f5f9' : '#0f172a';
    const nodeTextColor = theme === 'light' ? '#020617' : '#ffffff';

    return (
      <div className="w-full h-full rounded-lg overflow-hidden">
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          graphData={graphData}
          nodeLabel={(node: GraphNode) =>
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
            ctx.fillStyle = getNodeColor(node as GraphNode);
            const x = typeof node.x === 'number' ? node.x : 0;
            const y = typeof node.y === 'number' ? node.y : 0;
            const radius = (node.val / 2) || 6;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fill();

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