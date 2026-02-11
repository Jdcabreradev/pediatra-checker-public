import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Info, Sparkles, AlertCircle } from 'lucide-react';
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
    } catch (e) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error de red. Por favor, verifica tu conexión y vuelve a intentarlo.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white shadow-3xl rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden border border-slate-100 relative">
      {/* Chat Header */}
      <div className="bg-primary p-4 md:p-8 text-white flex items-center justify-between shadow-2xl relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full -mr-20 -mt-20"></div>
        
        <div className="flex items-center gap-3 md:gap-5 relative z-10">
          <div className="bg-white/15 p-2.5 md:p-4 rounded-xl md:rounded-[1.5rem] backdrop-blur-2xl border border-white/20 shadow-inner">
            <Sparkles size={20} className="text-blue-100 md:hidden" />
            <Sparkles size={28} className="text-blue-100 hidden md:block" />
          </div>
          <div className="text-left">
            <h3 className="font-black text-sm md:text-xl uppercase tracking-wider leading-tight">Asistente Virtual SCP</h3>
            <div className="flex items-center gap-2 mt-0.5 md:mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <p className="text-[8px] md:text-[10px] text-blue-100 font-black uppercase tracking-[0.2em]">En línea</p>
            </div>
          </div>
        </div>
        <button className="p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-xl md:rounded-2xl transition-all active:scale-90 border border-white/10 group">
          <Info size={18} className="md:hidden" />
          <Info size={24} className="group-hover:rotate-12 transition-transform hidden md:block" />
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 bg-slate-50/30 custom-scrollbar relative">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
            <div className={`flex gap-3 md:gap-5 max-w-[90%] md:max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`mt-1 md:mt-2 p-2 md:p-3 rounded-xl md:rounded-2xl flex-shrink-0 shadow-lg ${m.role === 'user' ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>
                {m.role === 'user' ? <User size={16} className="md:w-5 md:h-5" strokeWidth={2.5} /> : <Bot size={16} className="md:w-5 md:h-5" strokeWidth={2.5} />}
              </div>
              <div className={`p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-xl relative group text-left ${
                m.role === 'user' 
                  ? 'bg-primary text-white rounded-tr-none border border-blue-800' 
                  : 'bg-white text-slate-800 border border-slate-50 rounded-tl-none shadow-slate-100/50'
              }`}>
                <p className="text-sm md:text-base leading-relaxed font-bold tracking-tight">{m.content}</p>
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3 md:gap-5 max-w-[85%]">
              <div className="mt-1 md:mt-2 p-2 md:p-3 rounded-xl md:rounded-2xl bg-white text-primary border border-slate-100 shadow-lg">
                <Spinner size={20} />
              </div>
              <div className="p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-white text-slate-400 border border-slate-100 rounded-tl-none italic text-[10px] md:text-sm font-black uppercase tracking-widest flex items-center gap-3">
                Consultando...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-4 md:p-8 bg-white border-t border-slate-100 relative flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2 md:gap-3 items-center">
            <div className="flex-grow">
                <Input 
                    placeholder="Nombre del pediatra..."
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    disabled={isLoading}
                />
            </div>
            <Button 
                theme="info"
                type="submit"
                disabled={!input.trim() || isLoading}
            >
                {isLoading ? <Spinner size={20} color="white" /> : <Send size={20} />}
            </Button>
        </form>
        
        <div className="flex justify-between items-center mt-4 md:mt-6 px-1 md:px-4">
          <div className="flex items-center gap-2 text-slate-400">
             <AlertCircle size={12} className="md:w-3.5 md:h-3.5" />
             <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">
               Directorio Oficial SCP 2026
             </p>
          </div>
          <p className="text-[8px] md:text-[10px] text-slate-300 font-black uppercase tracking-widest hidden xs:block">
            SCP Santander · <a href="/admin" className="text-indigo-400 hover:text-indigo-600 underline">Admin</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
