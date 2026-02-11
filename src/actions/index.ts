import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import ollama from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs/promises';
import path from 'node:path';

const DB_PATH = './data/lancedb';
const TABLE_NAME = 'pediatricians';
const JSON_PATH = './src/data/pediatricians.json';

// Helper to get embeddings from Ollama
async function getEmbedding(text: string) {
  const response = await ollama.embeddings({
    model: 'nomic-embed-text',
    prompt: text,
  });
  return response.embedding;
}

// Sync JSON to LanceDB
async function syncDatabase() {
  const db = await lancedb.connect(DB_PATH);
  const data = JSON.parse(await fs.readFile(JSON_PATH, 'utf-8'));
  
  const records = await Promise.all(data.map(async (p: any) => ({
    vector: await getEmbedding(`${p.name} ${p.specialty} ${p.registry} ${p.city}`),
    id: p.id,
    name: p.name,
    specialty: p.specialty,
    registry: p.registry,
    city: p.city,
    status: p.status,
    office: p.office
  })));

  try {
    await db.dropTable(TABLE_NAME);
  } catch (e) {}
  
  return await db.createTable(TABLE_NAME, records);
}

export const server = {
  // Action to chat using RAG
  chat: defineAction({
    input: z.object({
      messages: z.array(z.object({ role: z.string(), content: z.string() }))
    }),
    handler: async ({ messages }) => {
      const lastMessage = messages[messages.length - 1].content;
      
      const db = await lancedb.connect(DB_PATH);
      const table = await db.openTable(TABLE_NAME);
      
      const queryVector = await getEmbedding(lastMessage);
      const results = await table.search(queryVector).limit(3).execute();

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
    }
  }),

  // CRUD Actions
  getPediatricians: defineAction({
    handler: async () => {
      const data = await fs.readFile(JSON_PATH, 'utf-8');
      return JSON.parse(data);
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
      const data = JSON.parse(await fs.readFile(JSON_PATH, 'utf-8'));
      if (input.id) {
        const index = data.findIndex((p: any) => p.id === input.id);
        data[index] = input;
      } else {
        const newId = (Math.max(...data.map((p: any) => parseInt(p.id))) + 1).toString();
        data.push({ ...input, id: newId });
      }
      await fs.writeFile(JSON_PATH, JSON.stringify(data, null, 2));
      await syncDatabase(); // Update vector db
      return { success: true };
    }
  }),

  deletePediatrician: defineAction({
    input: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      const data = JSON.parse(await fs.readFile(JSON_PATH, 'utf-8'));
      const filtered = data.filter((p: any) => p.id !== id);
      await fs.writeFile(JSON_PATH, JSON.stringify(filtered, null, 2));
      await syncDatabase();
      return { success: true };
    }
  })
};
