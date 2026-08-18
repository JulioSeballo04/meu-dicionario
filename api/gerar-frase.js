// ============================================================
// FUNCTION SERVERLESS (Vercel) — gera a frase de exemplo
// ============================================================
// Esse arquivo roda no servidor da Vercel, nunca no navegador.
// A chave da IA (GEMINI_API_KEY) fica guardada nas variáveis de
// ambiente da Vercel — o usuário do site nunca tem acesso a ela.
//
// Como configurar:
// 1. Crie uma chave gratuita em https://aistudio.google.com/app/apikey
// 2. No painel da Vercel: Project Settings -> Environment Variables
//    -> adicione GEMINI_API_KEY = sua_chave
// 3. Faça o deploy (vercel --prod ou via GitHub)
// ============================================================

export default async function handler(req, res) {
  // Libera CORS para o seu site do Firebase Hosting poder chamar essa function
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido." });
  }

  const { palavra, traducao } = req.body || {};
  if (!palavra) {
    return res.status(400).json({ erro: "Informe a palavra." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: "Chave da IA não configurada no servidor." });
  }

  try {
    const prompt = `Crie UMA frase curta e simples em inglês (nível iniciante/intermediário) usando a palavra "${palavra}"${traducao ? ` (que significa "${traducao}" em português)` : ""}. Responda APENAS com a frase em inglês, sem aspas, sem explicações, sem tradução.`;

    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 60 }
        })
      }
    );

    const dados = await resposta.json();
    const frase = dados?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!frase) {
      return res.status(200).json({ frase: null, aviso: "IA não retornou uma frase desta vez." });
    }

    return res.status(200).json({ frase: frase.replace(/^"|"$/g, "") });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Falha ao gerar frase de exemplo." });
  }
}
