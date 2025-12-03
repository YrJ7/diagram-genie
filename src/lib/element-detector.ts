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
  const neighborStr = neighbors && neighbors.length > 0
    ? `Nearby elements: ${neighbors.slice(0,4).map(n => (n.text ? `"${n.text}"` : n.type)).join(', ')}.`
    : '';

  return `Diagram topic: "${diagramTopic}". ${neighborStr}
Explain "${elementText}" in 2-3 sentences. DO NOT start with "This element", "The box", "The rectangle", or any shape label. Start directly with its purpose and function in the diagram. Then describe how it connects to nearby elements and why it matters.`;
};

export const buildDeepDivePrompt = (
  element: any,
  diagramTopic: string,
  neighbors: ElementContext[] = []
): string => {
  const elementText = (element?.text && element.text.trim()) || (element?.name ?? 'this element');
  const neighborStr = neighbors && neighbors.length > 0
    ? `Nearby elements include: ${neighbors.slice(0,6).map(n => (n.text ? `"${n.text}"` : n.type)).join(', ')}.`
    : '';

  return `Diagram topic: "${diagramTopic}". ${neighborStr}
Provide a detailed explanation of "${elementText}". DO NOT start with "This element", "The box", "The rectangle", or any shape label. Start directly with its function.
Include:
1) A clear description of its function and role in the diagram
2) Two short concrete examples or scenarios illustrating its role
3) One simple mnemonic to remember it
Use short paragraphs and bullet points. Focus on this element's role in the diagram, not generic definitions.`;
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

// Build a traversal order from elements using arrow bindings when available.
export const getTraversalOrder = (allElements: any[]): string[] => {
  if (!allElements || allElements.length === 0) return [];

  // Build adjacency list using arrow bindings when possible
  const nodes = allElements.filter((e) => e.type !== 'arrow' && e.type !== 'line');
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj: Record<string, Set<string>> = {};
  const indeg: Record<string, number> = {};

  for (const n of nodes) {
    adj[n.id] = new Set();
    indeg[n.id] = 0;
  }

  // Process arrow elements
  for (const el of allElements) {
    if (!el) continue;
    const t = el.type;
    if (t === 'arrow' || t === 'line') {
      // Prefer explicit binding ids if present
      const startId = el?.startBinding?.elementId || el?.startBinding?.id || null;
      const endId = el?.endBinding?.elementId || el?.endBinding?.id || null;

      if (startId && endId && nodeIds.has(startId) && nodeIds.has(endId)) {
        if (!adj[startId].has(endId)) {
          adj[startId].add(endId);
          indeg[endId] = (indeg[endId] ?? 0) + 1;
        }
      }
    }
  }

  // If we found no edges via bindings, try a heuristic: find arrows with points and match endpoints to nearest node
  const hasEdges = Object.values(adj).some((s) => s.size > 0);
  if (!hasEdges) {
    // simple heuristic: consider relative positions — sort nodes left-to-right top-to-bottom
    const sorted = nodes.slice().sort((a: any, b: any) => (a.x || 0) - (b.x || 0) || (a.y || 0) - (b.y || 0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i].id;
      const b = sorted[i + 1].id;
      if (!adj[a].has(b)) {
        adj[a].add(b);
        indeg[b] = (indeg[b] ?? 0) + 1;
      }
    }
  }

  // Topological-like traversal: start from nodes with indeg 0
  const queue: string[] = [];
  for (const id of Object.keys(indeg)) {
    if ((indeg[id] ?? 0) === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const nb of adj[id]) {
      indeg[nb] = (indeg[nb] ?? 1) - 1;
      if (indeg[nb] === 0) queue.push(nb);
    }
  }

  // If some nodes were not reached (cycle), append them
  const allNodeIds = nodes.map((n) => n.id);
  for (const id of allNodeIds) {
    if (!order.includes(id)) order.push(id);
  }

  return order;
};
