import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UPDATE_SYSTEM_PROMPT = `You are an expert at visual explanations and Mermaid diagrams. The user has an existing Mermaid diagram and wants to update it based on their instruction.

Rules:
1. ALWAYS output valid Mermaid syntax supported by Excalidraw.
2. Do NOT include markdown fences like \`\`\`mermaid or backticks.
3. Maintain the same diagram type unless the instruction specifically asks for a change.
4. Keep the diagram simple, clean, structured and beginner-friendly.
5. Output ONLY the updated Mermaid code—nothing else. No explanations, no comments.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentDiagram, instruction } = await req.json();
    
    if (!instruction) {
      return new Response(
        JSON.stringify({ error: 'Instruction is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Updating diagram with instruction:', instruction);

    const userMessage = currentDiagram 
      ? `Current Mermaid diagram:\n${currentDiagram}\n\nUser instruction:\n${instruction}`
      : `User instruction:\n${instruction}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: UPDATE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
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
    const mermaid = data.choices?.[0]?.message?.content?.trim() || '';
    
    console.log('Updated mermaid:', mermaid);

    return new Response(
      JSON.stringify({ mermaid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-diagram:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
