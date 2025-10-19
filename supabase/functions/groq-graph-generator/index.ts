import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GraphRequest {
  text: string;
  graphId?: string;
  actionType: 'create' | 'refine' | 'add_content' | 'focus';
  groqApiKey: string;
}

interface Node {
  label: string;
  description?: string;
  node_type: string;
}

interface Edge {
  source_label: string;
  target_label: string;
  label: string;
  relationship_type: string;
}

interface GraphResponse {
  nodes: Node[];
  edges: Edge[];
  summary?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { text, graphId, actionType, groqApiKey }: GraphRequest = await req.json();

    if (!text || !groqApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: text and groqApiKey" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const systemPrompt = getSystemPrompt(actionType);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return new Response(
        JSON.stringify({ error: "Groq API error", details: errorData }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content in response" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const graphData = parseGraphResponse(content);

    return new Response(
      JSON.stringify(graphData),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

function getSystemPrompt(actionType: string): string {
  const basePrompt = `You are a knowledge graph generator. Extract entities and relationships from the provided text and return them in a structured JSON format.

IMPORTANT: Your response must ONLY contain valid JSON, no additional text or explanations.

The JSON structure must be:
{
  "nodes": [
    {
      "label": "Entity Name",
      "description": "Brief description",
      "node_type": "concept|person|place|organization|event|other"
    }
  ],
  "edges": [
    {
      "source_label": "Source Entity Name",
      "target_label": "Target Entity Name",
      "label": "relationship description",
      "relationship_type": "related_to|part_of|causes|precedes|etc"
    }
  ],
  "summary": "Brief summary of the graph"
}

Extract meaningful entities and their relationships. Focus on key concepts, people, organizations, events, and their connections.`;

  if (actionType === 'refine') {
    return basePrompt + "\n\nThe user wants to REFINE the existing graph. Analyze the text and suggest improvements, corrections, or additional connections.";
  } else if (actionType === 'add_content') {
    return basePrompt + "\n\nThe user wants to ADD MORE CONTENT to the existing graph. Extract new entities and relationships from the text.";
  } else if (actionType === 'focus') {
    return basePrompt + "\n\nThe user wants to FOCUS on a specific topic. Extract entities and relationships specifically related to the topic mentioned.";
  }

  return basePrompt;
}

function parseGraphResponse(content: string): GraphResponse {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
        summary: parsed.summary || "",
      };
    }
  } catch (e) {
    console.error("Failed to parse JSON:", e);
  }

  return {
    nodes: [],
    edges: [],
    summary: "Failed to parse graph data",
  };
}
