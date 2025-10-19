import Groq from 'groq-sdk';

const apiKey = import.meta.env.VITE_GROQ_API_KEY;

if (!apiKey) {
  throw new Error('Missing Groq API key');
}

const groq = new Groq({
  apiKey,
  dangerouslyAllowBrowser: true,
});

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    description: string;
    type: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationship: string;
  }>;
}

export async function extractKnowledgeGraph(text: string): Promise<GraphData> {
  const prompt = `Analiza el siguiente texto y extrae un mapa de conocimiento en formato JSON.

El JSON debe tener esta estructura exacta:
{
  "nodes": [
    {
      "id": "1",
      "label": "Nombre del concepto",
      "description": "Breve descripción del concepto",
      "type": "concepto principal o secundario"
    }
  ],
  "edges": [
    {
      "source": "1",
      "target": "2",
      "relationship": "tipo de relación (ej: causa, define, relaciona con)"
    }
  ]
}

Instrucciones:
- Identifica entre 5 y 15 conceptos clave del texto
- Usa IDs numéricos simples (1, 2, 3...)
- Las relaciones deben ser claras y específicas
- Clasifica los nodos como "principal" o "secundario"
- Asegúrate de que el JSON sea válido

Texto a analizar:
${text}

Responde SOLO con el JSON, sin explicaciones adicionales.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 4096,
    });

    const responseText = completion.choices[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se pudo extraer JSON de la respuesta');
    }

    const graphData: GraphData = JSON.parse(jsonMatch[0]);

    if (!graphData.nodes || !Array.isArray(graphData.nodes)) {
      throw new Error('Formato de respuesta inválido: falta el array de nodos');
    }

    if (!graphData.edges || !Array.isArray(graphData.edges)) {
      throw new Error('Formato de respuesta inválido: falta el array de edges');
    }

    return graphData;
  } catch (error) {
    console.error('Error al extraer grafo de conocimiento:', error);
    throw new Error('No se pudo procesar el texto. Por favor, intenta de nuevo.');
  }
}
