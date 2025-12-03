import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Trash2, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ExcalidrawCanvasRef {
  importMermaid: (mermaidCode: string) => Promise<void>;
  clearCanvas: () => void;
  exportDiagram: () => Promise<void>;
}

interface ExcalidrawCanvasProps {
  onSceneChange?: (elements: readonly any[]) => void;
}

const ExcalidrawCanvas = forwardRef<ExcalidrawCanvasRef, ExcalidrawCanvasProps>(
  ({ onSceneChange }, ref) => {
    const excalidrawRef = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    const importMermaid = useCallback(async (mermaidCode: string) => {
      if (!excalidrawRef.current) {
        toast.error('Canvas not ready');
        return;
      }

      setIsLoading(true);
      try {
        const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
        const { elements, files } = await parseMermaidToExcalidraw(mermaidCode);
        
        excalidrawRef.current.updateScene({
          elements,
          appState: { viewBackgroundColor: 'transparent' },
        });
        
        if (files) {
          excalidrawRef.current.addFiles(Object.values(files));
        }

        // Fit to screen
        excalidrawRef.current.scrollToContent(elements, { fitToViewport: true });
        
        toast.success('Diagram generated successfully');
      } catch (error) {
        console.error('Failed to import mermaid:', error);
        toast.error('Failed to render diagram. The Mermaid syntax may be invalid.');
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
            exportWithDarkMode: document.documentElement.classList.contains('dark'),
            viewBackgroundColor: 'transparent',
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

    useImperativeHandle(ref, () => ({
      importMermaid,
      clearCanvas,
      exportDiagram,
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
      </div>
    );
  }
);

ExcalidrawCanvas.displayName = 'ExcalidrawCanvas';

export default ExcalidrawCanvas;
