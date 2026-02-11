import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pediatricians from '../../data/pediatricians.json';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const POST: APIRoute = async ({ request }) => {
  const { messages } = await request.json();
  const lastMessage = messages[messages.length - 1].content;

  if (!process.env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ 
      role: 'assistant', 
      content: 'Error: GEMINI_API_KEY no configurada en el servidor. Por favor, añade la clave al archivo .env.' 
    }), { status: 200 });
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemPrompt = `Eres un asistente de la Sociedad de Pediatría Regional Santander. 
Tu misión es ayudar a los usuarios a verificar si un pediatra está afiliado.
Aquí tienes la lista oficial de afiliados:
${JSON.stringify(pediatricians, null, 2)}

Si te preguntan por un nombre, búscalo en la lista. 
- Si lo encuentras, confirma su afiliación y da sus detalles (Registro, Especialidad, Ciudad, Consultorio).
- Si no lo encuentras, sé amable, informa que no aparece en la lista actual y sugiere contactar a la Sociedad directamente (+57 318 8017142).
- Si te saludan o preguntan cosas generales, responde profesionalmente como representante de la Sociedad.

Responde siempre en español.`;

  try {
    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Entendido. Estoy listo para ayudar a verificar pediatras afiliados a la Sociedad de Pediatría Regional Santander." }] },
        ...messages.slice(0, -1).map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      ],
    });

    const result = await chat.sendMessage(lastMessage);
    const response = await result.response;
    const text = response.text();

    return new Response(JSON.stringify({ role: 'assistant', content: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ role: 'assistant', content: "Hubo un error procesando tu solicitud: " + e.message }), { status: 200 });
  }
};
