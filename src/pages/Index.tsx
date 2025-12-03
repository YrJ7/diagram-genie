import { useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import ExcalidrawCanvas, { ExcalidrawCanvasRef } from '@/components/ExcalidrawCanvas';
import ChatPanel from '@/components/ChatPanel';
import { toast } from 'sonner';

export default function Index() {
  const canvasRef = useRef<ExcalidrawCanvasRef>(null);
  const [currentMermaid, setCurrentMermaid] = useState('');

  const handleGenerateDiagram = useCallback(async (topic: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-diagram`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ topic }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate diagram');
      }

      const data = await response.json();
      
      if (data.mermaid) {
        setCurrentMermaid(data.mermaid);
        canvasRef.current?.setDiagramTopic(topic);
        await canvasRef.current?.importMermaid(data.mermaid);
      } else {
        throw new Error('No diagram generated');
      }
    } catch (error) {
      console.error('Generate diagram error:', error);
      throw error;
    }
  }, []);

  const handleUpdateDiagram = useCallback(async (instruction: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-diagram`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ currentDiagram: currentMermaid, instruction }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update diagram');
      }

      const data = await response.json();
      
      if (data.mermaid) {
        setCurrentMermaid(data.mermaid);
        await canvasRef.current?.importMermaid(data.mermaid);
      } else {
        throw new Error('No updated diagram generated');
      }
    } catch (error) {
      console.error('Update diagram error:', error);
      throw error;
    }
  }, [currentMermaid]);

  return (
    <>
      <Helmet>
        <title>Diagram AI - Understand Any Topic Visually</title>
        <meta
          name="description"
          content="Transform complex topics into clear, visual diagrams using AI. Generate flowcharts, mindmaps, and more instantly."
        />
      </Helmet>

      <main className="h-screen w-screen flex overflow-hidden bg-background">
        {/* Canvas - 70% */}
        <div className="flex-1 min-w-0 h-full">
          <ExcalidrawCanvas ref={canvasRef} />
        </div>

        {/* Chat Panel - 30% */}
        <div className="w-[380px] xl:w-[420px] h-full flex-shrink-0">
          <ChatPanel
            onGenerateDiagram={handleGenerateDiagram}
            onUpdateDiagram={handleUpdateDiagram}
            currentMermaid={currentMermaid}
          />
        </div>
      </main>
    </>
  );
}
