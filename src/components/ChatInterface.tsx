import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot } from 'lucide-react';
import { actions } from 'astro:actions';
import { Button, Input, Spinner } from 'webcoreui/react';
import ReactMarkdown from 'react-markdown';

const ChatInterface = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola. Soy el Asistente Virtual de la Sociedad de Pediatría Regional Santander. Estoy capacitado para verificar la certificación de nuestros especialistas afiliados. Por favor, indíqueme el nombre del pediatra que desea consultar.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const currentMessages = [...messages, userMessage];
    
    // Clear input IMMEDIATELY before doing anything else
    setInput('');
    setMessages(currentMessages);
    setIsLoading(true);

    try {
      const { data, error } = await actions.chat({ messages: currentMessages });

      if (error) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Lo sentimos, el sistema de IA no está disponible en este momento. ' + error.message }]);
      } else if (data) {
          setMessages(prev => [...prev, data as any]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error crítico: ' + e.message 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0f172a] relative overflow-hidden">
      {/* Scrollable Messages Area */}
      <div className="flex-grow overflow-y-auto px-4 py-8 md:p-12 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-8">
            {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`flex gap-4 max-w-[90%] md:max-w-[80%] items-start ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`mt-1.5 p-2 rounded-xl flex-shrink-0 shadow-lg ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-[#1e293b] text-indigo-400 border border-[#334155]'}`}>
                    {m.role === 'user' ? <User size={16} strokeWidth={2.5} /> : <Bot size={16} strokeWidth={2.5} />}
                </div>
                <div className={`p-4 md:p-5 rounded-2xl shadow-2xl relative text-left leading-relaxed ${
                    m.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-[#1e293b] text-slate-200 border border-[#334155] rounded-tl-none'
                }`}>
                    <div className="text-sm md:text-base font-medium prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                            components={{
                                ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 my-2" {...props} />,
                                li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />
                            }}
                        >
                            {m.content}
                        </ReactMarkdown>
                    </div>
                </div>
                </div>
            </div>
            ))}
            
            {isLoading && (
            <div className="flex justify-start animate-pulse">
                <div className="flex gap-4 max-w-[80%] items-start">
                <div className="mt-1.5 p-2 rounded-xl bg-[#1e293b] text-indigo-400 border border-[#334155]">
                    <Spinner size={16} />
                </div>
                <div className="p-4 rounded-2xl bg-[#1e293b] text-slate-500 border border-[#334155] rounded-tl-none italic text-xs font-bold uppercase tracking-wider flex items-center">
                    Consultando el registro médico oficial...
                </div>
                </div>
            </div>
            )}
            <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - Pinned at the very bottom */}
      <div className="bg-[#1e293b]/80 backdrop-blur-xl border-t border-[#334155] p-4 md:p-8 flex-shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto w-full flex gap-3 items-center">
            <div className="flex-grow relative">
                <Input 
                    placeholder="Ingrese el nombre del especialista o RM..."
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#0f172a] border-[#475569] text-white rounded-2xl py-3.5 px-6 focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600 font-medium"
                />
            </div>
            <Button 
                theme="info"
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-indigo-500 hover:bg-indigo-600 border-none h-[52px] w-[52px] md:w-auto md:px-8 rounded-2xl shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
            >
                {isLoading ? <Spinner size={20} color="white" /> : <Send size={22} />}
            </Button>
        </form>
        <p className="text-center text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mt-4">
            Directorio Oficial 2026 · Sociedad de Pediatría Santander
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;
