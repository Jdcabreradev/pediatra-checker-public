import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs/promises';
import path from 'node:path';

// Initial data
import initialData from '../data/pediatricians.json';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lancedb');
const TABLE_NAME = 'pediatricians';
const JSON_PATH = path.join(DATA_DIR, 'pediatricians.json');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const EMBED_MODEL = "text-embedding-004"; // Stable embedding model
const CHAT_MODEL = "gemini-1.5-flash";

// Helper to get embeddings from Gemini
async function getEmbedding(text: string) {
  console.log(`[ACTIONS] Embedding text: ${text.substring(0, 30)}...`);
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  
  // Use the correct model name
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

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

async function syncDatabase() {
  console.log('[ACTIONS] Syncing with Gemini Embeddings...');
  const db = await lancedb.connect(DB_PATH);
  const data = await getCurrentData();
  
  const records = await Promise.all(data.map(async (p: any) => {
    try {
      const vector = await getEmbedding(`${p.name} ${p.specialty} ${p.registry} ${p.city}`);
      return {
        vector,
        id: p.id,
        name: p.name,
        specialty: p.specialty,
        registry: p.registry,
        city: p.city,
        status: p.status,
        office: p.office
      };
    } catch (err) {
      console.error(`[ACTIONS] Error embedding ${p.name}:`, err);
      throw err;
    }
  }));

  try { await db.dropTable(TABLE_NAME); } catch (err) {}
  return await db.createTable(TABLE_NAME, records);
}

async function getTable() {
  const db = await lancedb.connect(DB_PATH);
  try {
    return await db.openTable(TABLE_NAME);
  } catch (e) {
    return await syncDatabase();
  }
}

export const server = {
  chat: defineAction({
    input: z.object({
      messages: z.array(z.object({ role: z.string(), content: z.string() }))
    }),
    handler: async ({ messages }) => {
      console.log('[ACTIONS] Chat request received');
      if (!process.env.GEMINI_API_KEY) {
        return { role: 'assistant', content: '⚠️ Error: La clave GEMINI_API_KEY no está configurada.' };
      }

      const lastMessage = messages[messages.length - 1].content;
      
      try {
        const table = await getTable();
        const queryVector = await getEmbedding(lastMessage);
        const results = await table.search(queryVector).limit(3).toArray();

        const systemPrompt = `Eres un asistente experto de la Sociedad de Pediatría Regional Santander. Tu tono es médico, amable y formal.
Usa EXCLUSIVAMENTE esta información de la base de datos vectorial para responder:
${JSON.stringify(results, null, 2)}

REGLAS:
1. Si el médico está en la lista, confirma con entusiasmo y da los detalles.
2. Si no está, informa cortésmente y sugiere llamar al +57 318 8017142.
3. No inventes médicos.`;

        const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
        const chat = model.startChat({
          history: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "Entendido. Consultaré el registro oficial de la Sociedad para dar información exacta." }] },
            ...messages.slice(0, -1).map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }))
          ],
        });

        const result = await chat.sendMessage(lastMessage);
        return { role: 'assistant', content: result.response.text() };
      } catch (error: any) {
        console.error('[ACTIONS] Gemini Error:', error);
        return { role: 'assistant', content: 'Error de IA: ' + error.message };
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
