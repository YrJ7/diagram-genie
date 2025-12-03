import { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown, Sparkles, RefreshCw, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ActionMode = 'chat' | 'generate' | 'update';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: ActionMode;
}

interface ChatPanelProps {
  onGenerateDiagram: (topic: string) => Promise<void>;
  onUpdateDiagram: (instruction: string) => Promise<void>;
  currentMermaid: string;
}

const actionModes: { value: ActionMode; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'chat', label: 'Chat', icon: <MessageSquare className="w-4 h-4" />, description: 'Ask questions' },
  { value: 'generate', label: 'Generate', icon: <Sparkles className="w-4 h-4" />, description: 'Create diagram' },
  { value: 'update', label: 'Update', icon: <RefreshCw className="w-4 h-4" />, description: 'Modify diagram' },
];

export default function ChatPanel({ onGenerateDiagram, onUpdateDiagram, currentMermaid }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm here to help you understand complex topics visually. You can:\n\n• **Chat** with me about any topic\n• **Generate** a diagram from a concept\n• **Update** an existing diagram\n\nWhat would you like to explore?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ActionMode>('generate');
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      mode,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      if (mode === 'generate') {
        await onGenerateDiagram(userMessage.content);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: `I've generated a diagram for "${userMessage.content}". You can now:\n\n• Pan and zoom to explore it\n• Edit shapes and text directly\n• Ask me to **update** it with changes`,
          },
        ]);
      } else if (mode === 'update') {
        if (!currentMermaid) {
          toast.error('No diagram to update. Generate one first!');
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: "There's no diagram on the canvas yet. Try **generating** one first!",
            },
          ]);
        } else {
          await onUpdateDiagram(userMessage.content);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: `Done! I've updated the diagram based on your instruction: "${userMessage.content}"`,
            },
          ]);
        }
      } else {
        // Chat mode - stream response
        await streamChat([...messages, userMessage]);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      toast.error(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const streamChat = async (chatMessages: Message[]) => {
    const assistantId = Date.now().toString();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: chatMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Chat failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

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
            fullContent += content;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
            );
          }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }
  };

  const currentMode = actionModes.find((m) => m.value === mode)!;

  return (
    <div className="flex flex-col h-full bg-panel border-l border-border">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">AI Assistant</h2>
        <p className="text-sm text-muted-foreground">Visual learning powered by AI</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex animate-fade-in',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] text-sm',
                message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'
              )}
            >
              {message.mode && message.role === 'user' && (
                <div className="flex items-center gap-1 mb-1 opacity-70 text-xs">
                  {actionModes.find((m) => m.value === message.mode)?.icon}
                  <span>{actionModes.find((m) => m.value === message.mode)?.label}</span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="chat-bubble-assistant flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="flex gap-2">
          {/* Mode dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="action-dropdown h-full"
            >
              {currentMode.icon}
              <span className="hidden sm:inline">{currentMode.label}</span>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </button>

            {showModeDropdown && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
                {actionModes.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setMode(m.value);
                      setShowModeDropdown(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors',
                      mode === m.value && 'bg-accent'
                    )}
                  >
                    <span className={cn('text-muted-foreground', mode === m.value && 'text-primary')}>
                      {m.icon}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input field */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'generate'
                  ? 'Enter a topic to visualize...'
                  : mode === 'update'
                  ? 'How should I update the diagram?'
                  : 'Ask me anything...'
              }
              disabled={isLoading}
              className="w-full px-4 py-2.5 pr-12 bg-input border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
