import { useState, useEffect } from 'react';
import { actions } from 'astro:actions';
import { Edit2, Trash2, Plus, Save, X } from 'lucide-react';
import { Button, Input, Spinner } from 'webcoreui/react';

export default function AdminPanel() {
  const [pediatricians, setPediatricians] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await actions.getPediatricians();
    if (data) setPediatricians(data);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const payload = Object.fromEntries(formData);
    if (editing?.id) (payload as any).id = editing.id;

    await actions.savePediatrician(payload as any);
    setEditing(null);
    setIsNew(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (confirm('¿Eliminar este registro permanentemente?')) {
      await actions.deletePediatrician({ id });
      loadData();
    }
  }

  return (
    <div className="p-6 md:p-12 max-w-6xl mx-auto w-full bg-[#0f172a] min-h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">Gestión de Afiliados</h2>
            <p className="text-slate-400 text-sm mt-1 font-medium">Base de datos vectorial en LanceDB</p>
        </div>
        <Button 
          onClick={() => { setIsNew(true); setEditing({}); }}
          theme="info"
          className="bg-indigo-500 hover:bg-indigo-600 flex items-center gap-2 font-bold px-6 border-none"
        >
          <Plus size={20} /> Nuevo Registro
        </Button>
      </div>

      <div className="bg-[#1e293b] rounded-2xl shadow-xl border border-[#334155] overflow-hidden">
        {loading ? (
            <div className="p-20 flex justify-center items-center">
                <Spinner size={40} className="text-indigo-400" />
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[#0f172a]/50 border-b border-[#334155] text-slate-400 uppercase text-[10px] font-black tracking-widest">
                        <tr>
                            <th className="px-6 py-5">Nombre</th>
                            <th className="px-6 py-5">Especialidad</th>
                            <th className="px-6 py-5">Registro</th>
                            <th className="px-6 py-5">Ciudad</th>
                            <th className="px-6 py-5 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155]">
                        {pediatricians.map((p) => (
                        <tr key={p.id} className="hover:bg-[#334155]/30 transition-colors">
                            <td className="px-6 py-5 font-bold text-slate-200">{p.name}</td>
                            <td className="px-6 py-5 text-slate-400 text-sm font-medium">{p.specialty}</td>
                            <td className="px-6 py-5 text-indigo-300 font-mono text-xs tracking-tighter">{p.registry}</td>
                            <td className="px-6 py-5 text-slate-400 text-sm">{p.city}</td>
                            <td className="px-6 py-5 text-right">
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditing(p)} className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all">
                                    <Edit2 size={18} />
                                </button>
                                <button onClick={() => handleDelete(p.id)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {(editing || isNew) && (
        <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
          <div className="bg-[#1e293b] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#334155] animate-in fade-in slide-in-from-bottom-4">
            <div className="p-8 border-b border-[#334155] flex justify-between items-center bg-[#0f172a]/30">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">{isNew ? 'Nuevo Registro' : 'Editar Registro'}</h3>
                <p className="text-slate-400 text-xs mt-1">Los cambios se reflejarán en el chat al instante</p>
              </div>
              <button onClick={() => { setEditing(null); setIsNew(false); }} className="text-slate-500 hover:text-white transition-colors">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                <Input name="name" defaultValue={editing?.name} required className="w-full bg-[#0f172a] border-[#334155] text-white rounded-xl py-3" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Especialidad</label>
                  <Input name="specialty" defaultValue={editing?.specialty} required className="w-full bg-[#0f172a] border-[#334155] text-white rounded-xl py-3" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Registro Médico</label>
                  <Input name="registry" defaultValue={editing?.registry} required className="w-full bg-[#0f172a] border-[#334155] text-white rounded-xl py-3" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Ciudad</label>
                  <Input name="city" defaultValue={editing?.city} required className="w-full bg-[#0f172a] border-[#334155] text-white rounded-xl py-3" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado</label>
                  <select name="status" defaultValue={editing?.status || 'Activo'} className="w-full h-[46px] px-4 bg-[#0f172a] border border-[#334155] text-white rounded-xl outline-none focus:border-indigo-500 appearance-none">
                    <option>Activo</option>
                    <option>Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Consultorio / Clínica</label>
                <Input name="office" defaultValue={editing?.office} required className="w-full bg-[#0f172a] border-[#334155] text-white rounded-xl py-3" />
              </div>
              <Button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20 mt-4 border-none flex items-center justify-center gap-2">
                <Save size={20} /> Guardar Cambios
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
