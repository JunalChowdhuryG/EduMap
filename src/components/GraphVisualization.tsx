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
  comments?: unknown[];
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
    const [size, setSize] = useState({ width: 600, height: 400 });

    // ResizeObserver para que el canvas tenga el tamaño real del contenedor
   useEffect(() => {
     const el = containerRef.current;
     if (!el) return;
    const ro = new ResizeObserver(() => {
       const rect = el.getBoundingClientRect();
       setSize({ width: Math.max(200, Math.floor(rect.width)), height: Math.max(200, Math.floor(rect.height)) });
      });
      ro.observe(el);
      // inicializar tamaño
     const r = el.getBoundingClientRect();
      setSize({ width: Math.max(200, Math.floor(r.width)), height: Math.max(200, Math.floor(r.height)) });
      return () => ro.disconnect();
    }, []);

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
  // link force distance left default; if needed we can refine with d3 types
        fg.d3ReheatSimulation();
      } catch (err) {
        console.error('Error configurando fuerzas:', err);
      }
    }, [graphData]);

    // Re-ajustar vista cuando los datos cambian
    useEffect(() => {
      const fg = fgRef.current;
      if (!fg) return;
      // esperar un tick para dejar que la simulación arranque y luego ajustar vista
      const t = setTimeout(() => {
        try {
          if (fg.zoomToFit) fg.zoomToFit(400, 40);
        } catch (err) {
          // no crítico: fallo al centrar/ajustar vista
          console.debug('zoomToFit failed', err);
        }
      }, 200);
      return () => clearTimeout(t);
    }, [graphData, size]);

  const linkColor = theme === 'light' ? '#475569' : '#64748b';
  const backgroundColor = theme === 'light' ? '#f1f5f9' : '#0f172a';

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
      <div ref={containerRef} className="w-full h-full min-h-0 rounded-lg overflow-hidden">
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          graphData={graphData}
          width={size.width}
          height={size.height}
          // prevenir zoom extremo / asegurar encaje en contenedor
          onEngineStop={() => {
            const fg = fgRef.current;
            try {
              // centrar y ajustar al tamaño del contenedor
              if (fg?.zoomToFit) fg.zoomToFit(400, 40);
            } catch {
              // no crítico
            }
          }}
          // opcional: cuando cambian datos, re-ajustar vista
          onEngineTick={() => {
            /* mantener el motor en funcionamiento; el ajuste real se hace en onEngineStop */
          }}
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
            // guardar/restaurar contexto para no afectar dibujados externos
            ctx.save();

            const label = node.label || 'NODO';
            // fuente responsiva al zoom, con tamaño mínimo para legibilidad
            const fontSize = Math.max(10, Math.floor(12 / Math.max(0.5, globalScale)));
            ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;

            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const radius = Math.max(4, (node.val ?? 6) / 2);

            // Dibuja el nodo (círculo) primero
            if (node.id === highlightNodeId) {
              ctx.shadowBlur = 18;
              ctx.shadowColor = 'rgba(255,200,50,0.8)';
              ctx.fillStyle = '#FFEB99';
            } else {
              ctx.shadowBlur = 0;
              ctx.fillStyle = getNodeColor(node);
            }
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fill();

            // Texto y fondo (píldora) debajo del texto, localizado justo debajo del nodo
            ctx.shadowBlur = 0;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // ancho máximo para la etiqueta (proporcional al canvas)
            const maxLabelWidth = Math.min(size.width * 0.7, 280);
            const paddingX = 10;
            const paddingY = 6;

            // medir y truncar con elipsis si es necesario
            let textToDraw = label;
            let measured = ctx.measureText(textToDraw).width;
            if (measured > maxLabelWidth) {
              // truncar con bucle (suficientemente rápido para etiquetas cortas)
              while (textToDraw.length > 0 && ctx.measureText(textToDraw + '…').width > maxLabelWidth) {
                textToDraw = textToDraw.slice(0, -1);
              }
              textToDraw = textToDraw + '…';
              measured = ctx.measureText(textToDraw).width;
            }

            const rectW = measured + paddingX * 2;
            const rectH = fontSize + paddingY * 2;
            const rectX = x - rectW / 2;
            const rectY = y + radius + 8; // separación por debajo del nodo

            // fondo de la etiqueta (alto contraste en modo light)
            ctx.beginPath();
            const radiusRound = 8;
            // dibujar rectángulo redondeado
            ctx.fillStyle = theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(6,8,23,0.6)';
            ctx.strokeStyle = theme === 'light' ? 'rgba(2,6,23,0.06)' : 'rgba(255,255,255,0.04)';
            // rounded rect path
            ctx.moveTo(rectX + radiusRound, rectY);
            ctx.arcTo(rectX + rectW, rectY, rectX + rectW, rectY + rectH, radiusRound);
            ctx.arcTo(rectX + rectW, rectY + rectH, rectX, rectY + rectH, radiusRound);
            ctx.arcTo(rectX, rectY + rectH, rectX, rectY, radiusRound);
            ctx.arcTo(rectX, rectY, rectX + rectW, rectY, radiusRound);
            ctx.closePath();
            ctx.fill();
            ctx.lineWidth = 0.6;
            ctx.stroke();

            // texto
            ctx.fillStyle = theme === 'light' ? '#07122a' : '#ffffff';
            ctx.fillText(textToDraw, x, rectY + rectH / 2);

            ctx.restore();
          }}
        />
      </div>
    );
  }
);
