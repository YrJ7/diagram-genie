import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react';
import { Excalidraw, exportToBlob, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Trash2, Download, Loader2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSpeech } from '@/hooks/use-speech';
import { getElementDetails, buildExplanationPrompt, buildDeepDivePrompt, getElementContext } from '@/lib/element-detector';
import SpeechControls from './SpeechControls';
import ElementExplainer from './ElementExplainer';

export interface ExcalidrawCanvasRef {
  importMermaid: (mermaidCode: string) => Promise<void>;
  clearCanvas: () => void;
  exportDiagram: () => Promise<void>;
  setDiagramTopic: (topic: string) => void;
}

interface ExcalidrawCanvasProps {
  onSceneChange?: (elements: readonly any[]) => void;
  onElementSelect?: (element: any) => void;
}

const ExcalidrawCanvas = forwardRef<ExcalidrawCanvasRef, ExcalidrawCanvasProps>(
  ({ onSceneChange, onElementSelect }, ref) => {
    const excalidrawRef = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [diagramTopic, setDiagramTopic] = useState<string>('');
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [elementSummary, setElementSummary] = useState<string>('');
    const [elementNeighbors, setElementNeighbors] = useState<any[]>([]);
    const [elementExplanation, setElementExplanation] = useState<string>('');
    const [isExplainingElement, setIsExplainingElement] = useState(false);
    const [elementPosition, setElementPosition] = useState<{ x: number; y: number } | null>(null);
    const { speak, stop, isSpeaking } = useSpeech({ rate: 0.95 });
    const selectionCheckIntervalRef = useRef<any>(null);

    // Monitor for selection changes
    const startSelectionMonitoring = useCallback(() => {
      if (selectionCheckIntervalRef.current) return;
      
      selectionCheckIntervalRef.current = setInterval(() => {
        if (!excalidrawRef.current) return;
        
        try {
          const elements = excalidrawRef.current.getSceneElements() || [];
          const appState = excalidrawRef.current.getAppState() || {};
          
          // Get selected element IDs from appState
          const selectedIds = Object.keys(appState.selectedElementIds || {});
          
          if (selectedIds.length > 0) {
            const selectedId = selectedIds[selectedIds.length - 1];
            if (selectedId !== selectedElementId) {
              setSelectedElementId(selectedId);
              const selectedEl = elements.find((el: any) => el.id === selectedId);
                if (selectedEl) {
                  console.log('Element selected (awaiting action):', selectedEl);
                  onElementSelect?.(selectedEl);
                  // show explainer with options rather than auto-fetching
                  setSelectedElement(selectedEl);
                  setElementPosition({ x: selectedEl.x || 0, y: selectedEl.y || 0 });

                  // Build context-aware summary using nearby elements
                  try {
                    const ctx = getElementContext(selectedEl, elements || []);
                    setElementSummary(ctx.summary || getElementDetails(selectedEl) || 'Element');
                    setElementNeighbors(ctx.neighbors || []);
                  } catch (err) {
                    setElementSummary(getElementDetails(selectedEl) || 'Element');
                    setElementNeighbors([]);
                  }

                  setElementExplanation('');
                  setIsExplainingElement(false);
                }
            }
          } else if (selectedElementId) {
            setSelectedElementId(null);
            setSelectedElement(null);
            setElementSummary('');
            setElementExplanation('');
          }
        } catch (error) {
          console.error('Error checking selection:', error);
        }
      }, 300);
    }, [selectedElementId, onElementSelect]);

    const quickExplain = useCallback(async () => {
      if (!selectedElement || isExplainingElement) return;
      const summary = elementSummary || getElementDetails(selectedElement) || '';
      if (!summary) return;

      setElementExplanation('');
      setIsExplainingElement(true);

      try {
        // speak the short summary
        speak(summary);

        if (!diagramTopic) {
          setIsExplainingElement(false);
          return;
        }

        const prompt = buildExplanationPrompt(selectedElement, diagramTopic, elementNeighbors);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
        });

        if (!response.ok || !response.body) {
          console.error('Chat API error (quick):', response.status);
          setIsExplainingElement(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let explanation = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                explanation += content;
                setElementExplanation(explanation);
              }
            } catch {
              buffer = line + '\n' + buffer;
              break;
            }
          }
        }

        if (explanation) {
          speak(explanation);
        }
      } catch (error) {
        console.error('Quick explain failed:', error);
        toast.error('Quick explanation failed');
      } finally {
        setIsExplainingElement(false);
      }
    }, [selectedElement, elementSummary, diagramTopic, isExplainingElement, speak]);

    const deepDiveExplain = useCallback(async () => {
      if (!selectedElement || isExplainingElement) return;
      const summary = elementSummary || getElementDetails(selectedElement) || '';
      if (!summary) return;

      setElementExplanation('');
      setIsExplainingElement(true);

      try {
        const prompt = buildDeepDivePrompt(selectedElement, diagramTopic || 'the diagram', elementNeighbors);
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
        });

        if (!response.ok || !response.body) {
          console.error('Chat API error (deep):', response.status);
          setIsExplainingElement(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let explanation = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                explanation += content;
                setElementExplanation(explanation);
              }
            } catch {
              buffer = line + '\n' + buffer;
              break;
            }
          }
        }

        if (explanation) {
          speak(explanation);
        }
      } catch (error) {
        console.error('Deep dive failed:', error);
        toast.error('Deep dive failed');
      } finally {
        setIsExplainingElement(false);
      }
    }, [selectedElement, elementSummary, diagramTopic, isExplainingElement, speak]);

    const importMermaid = useCallback(async (mermaidCode: string) => {
      if (!excalidrawRef.current) {
        toast.error('Canvas not ready');
        return;
      }

      setIsLoading(true);
      try {
        const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
        
        // Clean up the mermaid code
        const cleanedCode = mermaidCode
          .replace(/```mermaid\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        
        console.log('Parsing mermaid code:', cleanedCode);
        
        const { elements, files } = await parseMermaidToExcalidraw(cleanedCode);
        
        if (!elements || elements.length === 0) {
          throw new Error('No elements generated from diagram');
        }

        console.log('Raw elements from mermaid:', elements.length);
        
        // Convert to proper Excalidraw elements
        const excalidrawElements = convertToExcalidrawElements(elements);
        
        console.log('Converted elements:', excalidrawElements.length);

        // Update scene with converted elements
        excalidrawRef.current.updateScene({
          elements: excalidrawElements,
        });
        
        // Add files (contains text rendered as images)
        if (files) {
          excalidrawRef.current.addFiles(Object.values(files));
        }

        // Fit to screen after elements are rendered
        setTimeout(() => {
          excalidrawRef.current?.scrollToContent(excalidrawElements, { fitToViewport: true });
        }, 200);
        
        toast.success('Diagram generated successfully');
      } catch (error) {
        console.error('Failed to import mermaid:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMessage.includes('Parse error')) {
          toast.error('Invalid diagram syntax. Try a simpler topic.');
        } else {
          toast.error('Failed to render diagram. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    }, []);

    const clearCanvas = useCallback(() => {
      if (!excalidrawRef.current) return;
      excalidrawRef.current.updateScene({ elements: [] });
      toast.success('Canvas cleared');
    }, []);

    const exportDiagram = useCallback(async () => {
      if (!excalidrawRef.current) return;
      
      const elements = excalidrawRef.current.getSceneElements();
      if (elements.length === 0) {
        toast.error('Nothing to export');
        return;
      }

      try {
        const blob = await exportToBlob({
          elements,
          mimeType: 'image/png',
          appState: {
            exportWithDarkMode: false,
            viewBackgroundColor: '#ffffff',
          },
          files: excalidrawRef.current.getFiles(),
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `diagram-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
        
        toast.success('Diagram exported');
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export diagram');
      }
    }, []);

    // Cleanup interval on unmount
    useEffect(() => {
      return () => {
        if (selectionCheckIntervalRef.current) {
          clearInterval(selectionCheckIntervalRef.current);
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      importMermaid,
      clearCanvas,
      exportDiagram,
      setDiagramTopic: (topic: string) => {
        setDiagramTopic(topic);
        // Start monitoring selections when diagram is ready
        startSelectionMonitoring();
      },
    }));

    return (
      <div className="relative h-full w-full bg-canvas">
        {/* Toolbar */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={clearCanvas}
            className="toolbar-button"
            title="Clear Canvas"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Clear</span>
          </button>
          <button
            onClick={exportDiagram}
            className="toolbar-button"
            title="Export Diagram"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {isSpeaking && (
            <button
              onClick={stop}
              className="toolbar-button text-red-500 hover:text-red-600"
              title="Stop Audio"
            >
              <Volume2 className="w-4 h-4 animate-pulse" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-card border border-border shadow-lg">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Rendering diagram...</span>
            </div>
          </div>
        )}

        {/* Excalidraw */}
        <Excalidraw
          excalidrawAPI={(api: any) => {
            excalidrawRef.current = api;
          }}
          theme="light"
          initialData={{
            appState: {
              viewBackgroundColor: '#ffffff',
            },
          }}
          UIOptions={{
            canvasActions: {
              saveAsImage: false,
              loadScene: false,
              export: false,
              saveToActiveFile: false,
            },
          }}
          onChange={(elements: any) => {
            onSceneChange?.(elements);
          }}
        />

        <SpeechControls
          isSpeaking={isSpeaking}
          onStop={stop}
          onPause={() => {
            // Browser pause/resume
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            } else {
              window.speechSynthesis.pause();
            }
          }}
        />

        {selectedElement && (
          <ElementExplainer
            elementText={elementSummary || getElementDetails(selectedElement) || 'Element'}
            explanation={elementExplanation}
            isLoading={isExplainingElement}
            isSpeaking={isSpeaking}
            position={elementPosition || undefined}
            onClose={() => {
              setSelectedElement(null);
              setSelectedElementId(null);
              setElementExplanation('');
              stop();
            }}
            onSpeak={() => {
              if (elementExplanation) {
                speak(elementExplanation);
              }
            }}
            onQuick={quickExplain}
            onDeepDive={deepDiveExplain}
          />
        )}

        <div className="absolute bottom-4 left-4 z-10 text-xs text-muted-foreground">
          💡 Click on diagram elements to learn more
        </div>
      </div>
    );
  }
);

ExcalidrawCanvas.displayName = 'ExcalidrawCanvas';

export default ExcalidrawCanvas;
