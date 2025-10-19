/*
  # Add Queries Table

  1. New Tables
    - `queries`
      - `id` (uuid, primary key)
      - `graph_id` (uuid, references graphs)
      - `user_id` (uuid, references auth.users)
      - `query_text` (text) - user's query or refinement request
      - `response` (jsonb) - LLM response with new nodes/edges
      - `action_type` (text) - type of action: 'refine', 'add_content', 'focus'
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on queries table
    - Add policies for authenticated users to manage queries in their graphs
*/
-- This migration fixes the RLS policies for the 'graphs' table to resolve infinite recursion.

-- Drop potentially recursive policies before creating new ones.
-- We are dropping a few common or default names to be safe.
DROP POLICY IF EXISTS "Enable read access for all users" ON graphs;
DROP POLICY IF EXISTS "Allow public read access" ON graphs;
DROP POLICY IF EXISTS "Public graphs are viewable by everyone." ON graphs;
DROP POLICY IF EXISTS "Users can view their own graphs." ON graphs;
DROP POLICY IF EXISTS "Users can create their own graphs." ON graphs;
DROP POLICY IF EXISTS "Users can update their own graphs." ON graphs;
DROP POLICY IF EXISTS "Users can delete their own graphs." ON graphs;


-- 1. Create non-recursive policies for the 'graphs' table

-- Allow anonymous and authenticated users to view public graphs.
CREATE POLICY "Public graphs are viewable by everyone."
  ON graphs FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Allow authenticated users to view their own graphs.
CREATE POLICY "Users can view their own graphs."
  ON graphs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow authenticated users to create graphs for themselves.
CREATE POLICY "Users can create their own graphs."
  ON graphs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update their own graphs.
CREATE POLICY "Users can update their own graphs."
  ON graphs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own graphs.
CREATE POLICY "Users can delete their own graphs."
  ON graphs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
