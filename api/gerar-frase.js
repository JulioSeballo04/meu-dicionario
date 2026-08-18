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
    const prompt = `Crie exatamente 5 frases curtas e simples em inglês (nível iniciante/intermediário), cada uma usando a palavra "${palavra}"${traducao ? ` (que significa "${traducao}" em português)` : ""}. Responda APENAS com as 5 frases, uma por linha, sem numeração, sem aspas, sem explicações, sem tradução.`;

    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 220 }
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error("Erro da API do Gemini:", dados);
      return res.status(200).json({ frases: [], aviso: dados?.error?.message || "Erro ao consultar a IA." });
    }

    const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!texto) {
      return res.status(200).json({ frases: [], aviso: "IA não retornou frases desta vez." });
    }

    // Quebra a resposta em linhas, remove numeração/traços/aspas que a IA às vezes adiciona
    const frases = texto
      .split("\n")
      .map((linha) => linha.replace(/^[\s\-•\d.)]+/, "").replace(/^"|"$/g, "").trim())
      .filter((linha) => linha.length > 0)
      .slice(0, 5);

    return res.status(200).json({ frases });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Falha ao gerar frase de exemplo." });
  }
}
