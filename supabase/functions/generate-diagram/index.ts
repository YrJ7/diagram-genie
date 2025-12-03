import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MERMAID_SYSTEM_PROMPT = `You are an expert at visual explanations. Convert the user's topic into a Mermaid diagram.

CRITICAL RULES - FOLLOW EXACTLY:
1. Output ONLY valid Mermaid code - no explanations, no markdown fences, no backticks
2. Use ONLY these diagram types: flowchart TD, flowchart LR, sequenceDiagram, classDiagram, erDiagram
3. Do NOT use mindmap - it has parsing issues
4. Node IDs must be simple alphanumeric (no spaces, no parentheses, no special chars)
5. Use square brackets for labels: A[Label with spaces]
6. For flowcharts, always start with "flowchart TD" or "flowchart LR"
7. Keep diagrams simple with 5-10 nodes maximum

CORRECT EXAMPLE:
flowchart TD
    A[Machine Learning] --> B[Supervised Learning]
    A --> C[Unsupervised Learning]
    B --> D[Classification]
    B --> E[Regression]
    C --> F[Clustering]
    C --> G[Dimensionality Reduction]

WRONG - DO NOT DO THIS:
- mindmap (not supported well)
- Node IDs with parentheses: A(Label)
- Node IDs with spaces: My Node[Label]
- Special characters in IDs: LLM's[Label]`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic } = await req.json();
    
    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'Topic is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Generating diagram for topic:', topic);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: MERMAID_SYSTEM_PROMPT },
          { role: 'user', content: `Create a flowchart diagram for: ${topic}` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let mermaid = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Clean up common issues
    mermaid = mermaid
      .replace(/```mermaid\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    console.log('Generated mermaid:', mermaid);

    return new Response(
      JSON.stringify({ mermaid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-diagram:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
