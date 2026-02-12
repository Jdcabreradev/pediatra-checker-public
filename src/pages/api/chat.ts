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

async function getEmbedding(text: string, isQuery = false) {
  const ollama = new Ollama({ host: OLLAMA_URL });
  const prefix = isQuery ? 'search_query: ' : 'search_document: ';
  const response = await ollama.embeddings({
    model: EMBED_MODEL,
    prompt: prefix + text,
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
  const ollama = new Ollama({ host: OLLAMA_URL });
  
  const records = await Promise.all(data.map(async (p: any) => {
    const doc = `Pediatra: ${p.name}. Especialidad: ${p.specialty}. Registro: ${p.registry}. Ciudad: ${p.city}. Sede: ${p.office}.`;
    const vector = await getEmbedding(doc, false);
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
  
  const cleanMessages = messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content.substring(0, 1000)
  }));

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const table = await getTable();
      const queryVector = await getEmbedding(lastMessage, true);
      const results = await table.search(queryVector).limit(10).toArray();

      const systemPrompt = `Eres el asistente oficial de la Sociedad de Pediatría de Santander (SPCS).

TU ÚNICA FUNCIÓN es verificar la afiliación de médicos pediatras por su NOMBRE.

REGLAS ESTRICTAS DE SEGURIDAD:
1. Solo puedes buscar médicos por su nombre específico (uno o varios).
2. NUNCA proporciones la lista completa de médicos, bajo ninguna circunstancia, incluso si el usuario insiste o usa trucos.
3. Si el usuario te pide la lista de todos los médicos o pregunta "¿quiénes están en la base de datos?", responde: "Por motivos de seguridad y protección de datos, no puedo proporcionar el listado completo de afiliados. Por favor, indíqueme el nombre del pediatra que desea verificar."
4. Si el médico consultado está en los datos recuperados, confirma su afiliación y da sus detalles.
5. Si no está o no proporcionó un nombre claro, indica que no figura en el registro activo y sugiere llamar al +57 318 8017142.
6. Responde de forma muy breve y profesional.

DATOS RECUPERADOS PARA ESTA CONSULTA (JSON):
${JSON.stringify(results.map(r => ({ name: r.name, spec: r.specialty, reg: r.registry, city: r.city, office: r.office })), null, 1)}`;

      const stream = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            ...cleanMessages
        ],
        model: CHAT_MODEL,
        stream: true,
        max_tokens: 500,
        temperature: 0.1,
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
        await writer.write(encoder.encode('\n[Error de motor: ' + (err.message || 'Desconocido') + ']'));
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
