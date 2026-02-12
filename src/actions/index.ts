import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { Ollama } from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs/promises';
import path from 'node:path';

// Initial data imported at build time
import initialData from '../data/pediatricians.json';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lancedb');
const TABLE_NAME = 'pediatricians';
const JSON_PATH = path.join(DATA_DIR, 'pediatricians.json');

// Initialize Ollama with explicit host from env
const getOllama = () => new Ollama({ 
  host: process.env.OLLAMA_HOST || 'http://host.docker.internal:11434' 
});

// Helper to get embeddings from Ollama (SEQUENTIAL to avoid timeouts)
async function getEmbedding(text: string) {
  const ollama = getOllama();
  // Set a longer timeout if possible, but sequential calls usually fix the load issue
  const response = await ollama.embeddings({
    model: 'nomic-embed-text',
    prompt: text,
  });
  return response.embedding;
}

// Get current data (from file or fallback to initial)
async function getCurrentData() {
  try {
    const data = await fs.readFile(JSON_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(JSON_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

// Sync JSON to LanceDB
async function syncDatabase() {
  console.log('Starting database sync...');
  const db = await lancedb.connect(DB_PATH);
  const data = await getCurrentData();
  
  const records = [];
  // Use sequential loop to prevent Ollama overload/timeouts
  for (const p of data) {
    try {
      console.log(`Generating embedding for ${p.name}...`);
      const vector = await getEmbedding(`${p.name} ${p.specialty} ${p.registry} ${p.city}`);
      records.push({
        vector,
        id: p.id,
        name: p.name,
        specialty: p.specialty,
        registry: p.registry,
        city: p.city,
        status: p.status,
        office: p.office
      });
    } catch (e) {
      console.error(`Failed to generate embedding for ${p.name}:`, e);
    }
  }

  if (records.length === 0) {
    console.error('No records to insert. Aborting table creation.');
    return;
  }

  try {
    await db.dropTable(TABLE_NAME);
  } catch (e) {}
  
  const tbl = await db.createTable(TABLE_NAME, records);
  console.log('Database sync complete.');
  return tbl;
}

// Helper to get table, auto-initializing if needed
async function getTable() {
  const db = await lancedb.connect(DB_PATH);
  const tableNames = await db.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    console.log('Table not found, initializing database...');
    return await syncDatabase();
  }
  return await db.openTable(TABLE_NAME);
}

export const server = {
  chat: defineAction({
    input: z.object({
      messages: z.array(z.object({ role: z.string(), content: z.string() }))
    }),
    handler: async ({ messages }) => {
      const lastMessage = messages[messages.length - 1].content;
      const ollama = getOllama();
      
      try {
        const table = await getTable();
        
        if (!table) {
            throw new Error('Database not available.');
        }

        // Get embedding for query
        const queryResp = await ollama.embeddings({
          model: 'nomic-embed-text',
          prompt: lastMessage,
        });
        
        const results = await table.search(queryResp.embedding).limit(3).toArray();

        const systemPrompt = `Eres un asistente experto y profesional de la Sociedad de Pediatría Regional Santander. Tu tono es médico, amable y formal.
Usa EXCLUSIVAMENTE la siguiente información de afiliados recuperada de la base de datos para responder consultas sobre especialistas.

CONTEXTO DE AFILIADOS RELEVANTES:
${JSON.stringify(results, null, 2)}

REGLAS:
1. Si encuentras una coincidencia, confirma el nombre completo, especialidad, registro médico y ciudad.
2. Si NO encuentras una coincidencia clara en la base de datos provista, indica cortésmente que el profesional no figura en el listado oficial de miembros activos.
3. Sugiere contactar al +57 318 8017142 para más información si es necesario.
4. No inventes información.`;

        const response = await ollama.chat({
          model: 'llama3.2:3b',
          messages: [{ role: 'system', content: systemPrompt }, ...messages]
        });

        return { role: 'assistant', content: response.message.content };
      } catch (error: any) {
        console.error('Chat Error Detail:', error);
        return { role: 'assistant', content: 'Error de comunicación con el motor de IA: ' + error.message };
      }
    }
  }),

  getPediatricians: defineAction({
    handler: async () => {
      return await getCurrentData();
    }
  }),

  savePediatrician: defineAction({
    input: z.object({
      id: z.string().optional(),
      name: z.string(),
      specialty: z.string(),
      registry: z.string(),
      city: z.string(),
      status: z.string(),
      office: z.string()
    }),
    handler: async (input) => {
      const data = await getCurrentData();
      if (input.id) {
        const index = data.findIndex((p: any) => p.id === input.id);
        if (index !== -1) data[index] = input;
        else data.push(input);
      } else {
        const nextId = data.length > 0 
          ? (Math.max(...data.map((p: any) => parseInt(p.id) || 0)) + 1).toString()
          : "1";
        data.push({ ...input, id: nextId });
      }
      await fs.writeFile(JSON_PATH, JSON.stringify(data, null, 2));
      
      // Re-initialize DB to force sync
      await syncDatabase(); 
      
      return { success: true };
    }
  }),

  deletePediatrician: defineAction({
    input: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      const data = await getCurrentData();
      const filtered = data.filter((p: any) => p.id !== id);
      await fs.writeFile(JSON_PATH, JSON.stringify(filtered, null, 2));
      
      await syncDatabase();

      return { success: true };
    }
  })
};
