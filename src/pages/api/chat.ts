import type { APIRoute } from 'astro';
import { Ollama } from 'ollama';
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs/promises';
import path from 'node:path';

// Initial data imported at build time
import initialData from '../../data/pediatricians.json';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lancedb');
const TABLE_NAME = 'pediatricians';
const JSON_PATH = path.join(DATA_DIR, 'pediatricians.json');

const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const CHAT_MODEL = 'llama3.2:1b';
const EMBED_MODEL = 'nomic-embed-text';

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
  const ollama = new Ollama({ host: OLLAMA_URL });
  
  const records = await Promise.all(data.map(async (p: any) => {
    const resp = await ollama.embeddings({
      model: EMBED_MODEL,
      prompt: `${p.name} ${p.specialty} ${p.registry} ${p.city}`,
    });
    return {
      vector: resp.embedding,
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

export const POST: APIRoute = async ({ request }) => {
  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1].content;
  const ollama = new Ollama({ host: OLLAMA_URL });

  // Create stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Background process to handle Ollama and stream output
  (async () => {
    try {
      // 1. Get Context (RAG)
      const table = await getTable();
      const queryResp = await ollama.embeddings({ model: EMBED_MODEL, prompt: lastMessage });
      const results = await table.search(queryResp.embedding).limit(3).toArray();

      const systemPrompt = `Eres un asistente experto y profesional de la Sociedad de Pediatría Regional Santander. Tu tono es médico, amable y formal.
Usa EXCLUSIVAMENTE la siguiente información para responder consultas:
${JSON.stringify(results, null, 2)}

REGLAS:
1. Si encuentras coincidencia, confirma datos (Nombre, Especialidad, Registro).
2. Si no, indica cortésmente que no figura en la lista activa.
3. Sugiere contactar al +57 318 8017142.`;

      // 2. Stream Ollama Response
      const response = await ollama.chat({
        model: CHAT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      });

      for await (const part of response) {
        if (part.message.content) {
          await writer.write(encoder.encode(part.message.content));
        }
      }
    } catch (err: any) {
      console.error('API Error:', err);
      await writer.write(encoder.encode('Error: ' + err.message));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
