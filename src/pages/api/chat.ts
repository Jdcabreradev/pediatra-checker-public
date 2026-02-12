import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs/promises';
import path from 'node:path';

// Initial data imported at build time
import initialData from '../../data/pediatricians.json';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lancedb');
const TABLE_NAME = 'pediatricians';
const JSON_PATH = path.join(DATA_DIR, 'pediatricians.json');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const EMBED_MODEL = "embedding-001";
const CHAT_MODEL = "gemini-1.5-flash";

async function getEmbedding(text: string) {
  console.log(`[API] Embedding text: ${text.substring(0, 30)}...`);
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
  console.log('[API] Syncing database with Gemini...');
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
      console.error(`[API] Error embedding ${p.name}:`, err);
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

export const POST: APIRoute = async ({ request }) => {
  console.log('[API] Chat request received');
  if (!process.env.GEMINI_API_KEY) {
      return new Response('GEMINI_API_KEY not set', { status: 500 });
  }

  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1].content;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const table = await getTable();
      const queryVector = await getEmbedding(lastMessage);
      const results = await table.search(queryVector).limit(3).toArray();

      const systemPrompt = `Eres un asistente experto y profesional de la Sociedad de Pediatría Regional Santander. Tu tono es médico, amable y formal.
Usa EXCLUSIVAMENTE la siguiente información para responder consultas:
${JSON.stringify(results, null, 2)}

REGLAS:
1. Si encuentras coincidencia, confirma datos (Nombre, Especialidad, Registro).
2. Si no, indica cortésmente que no figura en la lista activa.
3. Sugiere contactar al +57 318 8017142.`;

      const model = genAI.getGenerativeModel({ model: CHAT_MODEL });
      const result = await model.generateContentStream({
        contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Entendido. Consultaré el registro oficial.' }] },
            ...messages.map((m: any) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        ],
      });

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          await writer.write(encoder.encode(chunkText));
        }
      }
      console.log('[API] Stream finished normally');
    } catch (err: any) {
      console.error('[API] Error:', err);
      try {
        await writer.write(encoder.encode('\n[Error: ' + (err.message || 'Desconocido') + ']'));
      } catch (e) {}
    } finally {
      try {
        await writer.close();
      } catch (e) {}
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
