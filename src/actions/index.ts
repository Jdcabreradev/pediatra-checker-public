import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import Groq from 'groq-sdk';
import { Ollama } from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs/promises';
import path from 'node:path';

// Initial data
import initialData from '../data/pediatricians.json';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lancedb');
const TABLE_NAME = 'pediatricians';
const JSON_PATH = path.join(DATA_DIR, 'pediatricians.json');

// Initialize Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://host.docker.internal:11434' });

// Models
const EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL = "llama-3.1-8b-instant";

async function getEmbedding(text: string) {
  const response = await ollama.embeddings({
    model: EMBED_MODEL,
    prompt: text,
  });
  return response.embedding;
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
  const db = await lancedb.connect(DB_PATH);
  const data = await getCurrentData();
  
  const records = await Promise.all(data.map(async (p: any) => {
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
      if (!process.env.GROQ_API_KEY) return { role: 'assistant', content: 'GROQ_API_KEY missing' };

      const lastMessage = messages[messages.length - 1].content;
      
      try {
        const table = await getTable();
        const queryVector = await getEmbedding(lastMessage);
        const results = await table.search(queryVector).limit(3).toArray();

        const systemPrompt = `Eres el asistente de la SPCS. Datos:
${JSON.stringify(results.map(r => ({ name: r.name, sp: r.specialty, rg: r.registry, ct: r.city })), null, 1)}

Reglas: Sé breve. Confirma si está o sugiere llamar al +57 318 8017142.`;

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(m => ({
              role: (m.role === 'assistant' ? 'assistant' : 'user') as "assistant" | "user",
              content: m.content.substring(0, 500) // Truncate history to save tokens
            }))
          ],
          model: CHAT_MODEL,
          temperature: 0.2,
          max_tokens: 400,
        });

        return { role: 'assistant', content: chatCompletion.choices[0]?.message?.content || "" };
      } catch (error: any) {
        return { role: 'assistant', content: 'Error: ' + error.message };
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
