/**
 * Detects and analyzes diagram elements from Excalidraw
 */

interface DiagramElement {
  id: string;
  type: string;
  text?: string;
  label?: string;
}

export const getElementDetails = (element: any): string | null => {
  if (!element) return null;

  let details = '';

  // Get element type description - more comprehensive
  const typeDescriptions: Record<string, string> = {
    rectangle: 'Box',
    diamond: 'Decision diamond',
    ellipse: 'Oval',
    arrow: 'Connection arrow',
    line: 'Connecting line',
    text: 'Text label',
    image: 'Image',
    freedraw: 'Drawn shape',
  };

  const elementType = element.type || 'element';
  const typeLabel = typeDescriptions[elementType] || (elementType.charAt(0).toUpperCase() + elementType.slice(1));
  
  // Add text content if available - this is the key information
  if (element.text && element.text.trim()) {
    details = `"${element.text.trim()}"`;
    if (typeLabel !== 'Text label') {
      details += ` (${typeLabel})`;
    }
  } else {
    details = typeLabel;
  }

  return details;
};

export const buildExplanationPrompt = (
  element: any,
  diagramTopic: string,
  neighbors: ElementContext[] = []
): string => {
  const elementText = (element?.text && element.text.trim()) || (element?.name ?? 'this element');
  const elementType = element?.type || 'element';
  const neighborStr = neighbors && neighbors.length > 0
    ? `Nearby elements: ${neighbors.slice(0,4).map(n => (n.text ? `"${n.text}"` : n.type)).join(', ')}.`
    : '';

  return `You are given a diagram about "${diagramTopic}". ${neighborStr} Provide a concise, specific explanation (2-3 sentences) of the ${elementType} labeled "${elementText}" — describe what it does in this diagram, how it connects to nearby elements, and why it matters for understanding the overall diagram. Avoid generic definitions unrelated to the diagram.`;
};

export const buildDeepDivePrompt = (
  element: any,
  diagramTopic: string,
  neighbors: ElementContext[] = []
): string => {
  const elementText = (element?.text && element.text.trim()) || (element?.name ?? 'this element');
  const elementType = element?.type || 'element';
  const neighborStr = neighbors && neighbors.length > 0
    ? `Nearby elements include: ${neighbors.slice(0,6).map(n => (n.text ? `"${n.text}"` : n.type)).join(', ')}.`
    : '';

  return `You are an expert teacher. The diagram is about "${diagramTopic}". ${neighborStr} Provide a detailed, diagram-aware explanation of the ${elementType} labeled "${elementText}". Include:
1) A clear description of its function and how it fits into this specific diagram.
2) Two short concrete examples or scenarios that illustrate its role in the diagram.
3) One simple mnemonic or suggestion to remember its purpose.
Write short paragraphs and use bullet points where helpful. Keep the answer focused on the element's role in this diagram (do not provide a generic textbook definition).`;
};

export interface ElementContext {
  id: string;
  text: string;
  type: string;
  distance?: number;
}

export const getElementContext = (element: any, allElements: any[]): { summary: string; neighbors: ElementContext[] } => {
  if (!element) return { summary: '', neighbors: [] };

  // Compute center for element
  const elCenter = {
    x: (element.x ?? 0) + (element.width ?? 0) / 2,
    y: (element.y ?? 0) + (element.height ?? 0) / 2,
  };

  const neighbors: ElementContext[] = [];

  for (const other of allElements) {
    if (!other || other.id === element.id) continue;

    // Only consider elements that have visible text or shapes
    const otherCenter = {
      x: (other.x ?? 0) + (other.width ?? 0) / 2,
      y: (other.y ?? 0) + (other.height ?? 0) / 2,
    };

    const dx = otherCenter.x - elCenter.x;
    const dy = otherCenter.y - elCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // consider nearby elements within 400px
    if (dist < 400) {
      neighbors.push({
        id: other.id,
        text: (other.text && other.text.trim()) || (other.name ?? '') || '',
        type: other.type || 'element',
        distance: Math.round(dist),
      });
    }
  }

  neighbors.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  const typeLabel = (element.type || 'element').toString();
  const mainText = (element.text && element.text.trim()) || (element.name ?? '') || typeLabel;

  const neighborList = neighbors.slice(0, 4).map((n) => (n.text ? `"${n.text}"` : n.type)).join(', ');

  const summary = neighborList
    ? `${mainText} (${typeLabel}) — connected/near: ${neighborList}`
    : `${mainText} (${typeLabel})`;

  return { summary, neighbors };
};
