import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot } from 'lucide-react';
import { actions } from 'astro:actions';
import { Button, Input, Spinner } from 'webcoreui/react';

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
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await actions.chat({ messages: newMessages });

      if (error) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Lo sentimos, el sistema de IA no está disponible en este momento. ' + error.message }]);
      } else if (data) {
          setMessages(prev => [...prev, data]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error de red: ' + e.message 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0f172a] relative overflow-hidden">
      {/* Chat Messages */}
      <div className="grow overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 bg-[#0f172a] custom-scrollbar relative">
        <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
            {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`flex gap-3 md:gap-4 max-w-[95%] md:max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`mt-1 p-2 rounded-lg shrink-0 shadow-sm ${m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-[#1e293b] text-indigo-400 border border-[#334155]'}`}>
                    {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={`p-3 md:p-4 rounded-2xl shadow-lg relative text-left ${
                    m.role === 'user' 
                    ? 'bg-indigo-500 text-white rounded-tr-none' 
                    : 'bg-[#1e293b] text-slate-200 border border-[#334155] rounded-tl-none'
                }`}>
                    <p className="text-sm md:text-base leading-relaxed font-medium">{m.content}</p>
                </div>
                </div>
            </div>
            ))}
            
            {isLoading && (
            <div className="flex justify-start animate-pulse">
                <div className="flex gap-3 md:gap-4 max-w-[85%]">
                <div className="mt-1 p-2 rounded-lg bg-[#1e293b] text-indigo-400 border border-[#334155]">
                    <Spinner size={16} />
                </div>
                <div className="p-3 md:p-4 rounded-2xl bg-[#1e293b] text-slate-400 border border-[#334155] rounded-tl-none italic text-xs flex items-center">
                    Consultando registros oficiales...
                </div>
                </div>
            </div>
            )}
            <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input Area - Pinned to bottom */}
      <div className="p-4 md:p-6 bg-[#1e293b] border-t border-[#334155] relative shrink-0 shadow-2xl">
        <form onSubmit={handleSend} className="flex gap-3 items-center max-w-4xl mx-auto w-full">
            <div className="grow">
                <Input 
                    placeholder="Escriba el nombre o registro del médico..."
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-[#0f172a] border-[#475569] text-white"
                />
            </div>
            <Button 
                theme="info"
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-indigo-500 hover:bg-indigo-600 border-none h-[42px] px-6"
            >
                {isLoading ? <Spinner size={18} color="white" /> : <Send size={18} />}
            </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
