import type { APIRoute } from 'astro';
import Groq from 'groq-sdk';
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

// Initialize Clients
const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const EMBED_MODEL = "nomic-embed-text";
const CHAT_MODEL = "llama-3.1-8b-instant";

async function getEmbedding(text: string) {
  const ollama = new Ollama({ host: OLLAMA_URL });
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

export const POST: APIRoute = async ({ request }) => {
  if (!process.env.GROQ_API_KEY) {
      return new Response('GROQ_API_KEY not set', { status: 500 });
  }

  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1].content;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

      const stream = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m: any) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }))
        ],
        model: CHAT_MODEL,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          await writer.write(encoder.encode(content));
        }
      }
    } catch (err: any) {
      console.error('API Error (Groq):', err);
      try {
        await writer.write(encoder.encode('\n[Error de motor Groq: ' + (err.message || 'Desconocido') + ']'));
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
