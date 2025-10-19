/*
  # Create Knowledge Graph Schema

  1. New Tables
    - `knowledge_graphs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text)
      - `description` (text, optional)
      - `source_text` (text) - Original text used to generate the graph
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `graph_nodes`
      - `id` (uuid, primary key)
      - `graph_id` (uuid, references knowledge_graphs)
      - `label` (text) - Node name/concept
      - `description` (text, optional) - Detailed explanation
      - `node_type` (text) - Type of concept (entity, theme, etc)
      - `position_x` (float, optional) - For saving layout
      - `position_y` (float, optional)
      - `created_at` (timestamptz)
    
    - `graph_edges`
      - `id` (uuid, primary key)
      - `graph_id` (uuid, references knowledge_graphs)
      - `source_node_id` (uuid, references graph_nodes)
      - `target_node_id` (uuid, references graph_nodes)
      - `relationship` (text) - Description of the relationship
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own graphs
*/

-- Create knowledge_graphs table
CREATE TABLE IF NOT EXISTS knowledge_graphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  source_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create graph_nodes table
CREATE TABLE IF NOT EXISTS graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id uuid REFERENCES knowledge_graphs(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  description text DEFAULT '',
  node_type text DEFAULT 'concept',
  position_x float DEFAULT 0,
  position_y float DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create graph_edges table
CREATE TABLE IF NOT EXISTS graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id uuid REFERENCES knowledge_graphs(id) ON DELETE CASCADE NOT NULL,
  source_node_id uuid REFERENCES graph_nodes(id) ON DELETE CASCADE NOT NULL,
  target_node_id uuid REFERENCES graph_nodes(id) ON DELETE CASCADE NOT NULL,
  relationship text DEFAULT 'relates to',
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE knowledge_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for knowledge_graphs
CREATE POLICY "Users can view own graphs"
  ON knowledge_graphs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own graphs"
  ON knowledge_graphs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own graphs"
  ON knowledge_graphs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own graphs"
  ON knowledge_graphs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for graph_nodes
CREATE POLICY "Users can view nodes of own graphs"
  ON graph_nodes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_nodes.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create nodes in own graphs"
  ON graph_nodes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_nodes.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update nodes in own graphs"
  ON graph_nodes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_nodes.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_nodes.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete nodes in own graphs"
  ON graph_nodes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_nodes.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

-- RLS Policies for graph_edges
CREATE POLICY "Users can view edges of own graphs"
  ON graph_edges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_edges.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create edges in own graphs"
  ON graph_edges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_edges.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update edges in own graphs"
  ON graph_edges FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_edges.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_edges.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete edges in own graphs"
  ON graph_edges FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_graphs
      WHERE knowledge_graphs.id = graph_edges.graph_id
      AND knowledge_graphs.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_graphs_user_id ON knowledge_graphs(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_graph_id ON graph_nodes(graph_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_graph_id ON graph_edges(graph_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_node_id);