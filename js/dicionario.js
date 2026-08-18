// ============================================================
// DICIONÁRIO DO ALUNO
// ============================================================

let letraSelecionada = "TODAS";
let cacheDePalavras = [];

exigirLogin("aluno");

auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  const perfil = await db.collection("usuarios").doc(user.uid).get();
  document.getElementById("nome-usuario").textContent = perfil.data().nome;
  carregarMensagensDoProfessor(user.uid);
  escutarPalavras(user.uid);
});

// Escuta em tempo real a coleção de palavras do aluno logado
function escutarPalavras(uid) {
  db.collection("usuarios").doc(uid).collection("palavras")
    .orderBy("palavraEn")
    .onSnapshot((snapshot) => {
      cacheDePalavras = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      montarIndiceLetras();
      renderizarPalavras();
    });
}

// Monta as abas de A-Z no menu lateral, marcando quais têm palavras
function montarIndiceLetras() {
  const letrasComPalavras = new Set(
    cacheDePalavras.map((p) => p.palavraEn[0].toUpperCase())
  );
  const container = document.getElementById("indice-letras-lista");
  container.innerHTML = "";

  const todas = document.createElement("button");
  todas.className = "letra-tab" + (letraSelecionada === "TODAS" ? " ativa" : "");
  todas.textContent = "•";
  todas.title = "Todas";
  todas.onclick = () => { letraSelecionada = "TODAS"; montarIndiceLetras(); renderizarPalavras(); };
  container.appendChild(todas);

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((letra) => {
    const btn = document.createElement("button");
    let classe = "letra-tab";
    if (letra === letraSelecionada) classe += " ativa";
    if (letrasComPalavras.has(letra)) classe += " tem-palavras";
    btn.className = classe;
    btn.textContent = letra;
    btn.onclick = () => { letraSelecionada = letra; montarIndiceLetras(); renderizarPalavras(); };
    container.appendChild(btn);
  });
}

function renderizarPalavras() {
  const lista = letraSelecionada === "TODAS"
    ? cacheDePalavras
    : cacheDePalavras.filter((p) => p.palavraEn[0].toUpperCase() === letraSelecionada);

  const grade = document.getElementById("grade-cartoes");
  grade.innerHTML = "";

  if (lista.length === 0) {
    grade.innerHTML = `<p class="vazio">Nenhuma palavra aqui ainda. Adicione uma acima!</p>`;
    return;
  }

  lista.forEach((p) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-palavra";
    cartao.innerHTML = `
      <button class="remover" title="Remover" onclick="removerPalavra('${p.id}')">✕</button>
      <div class="palavra-en">${p.palavraEn}</div>
      <div class="palavra-pt">${p.traducaoPt}</div>
      ${p.fraseExemplo ? `<div class="frase-exemplo">"${p.fraseExemplo}"</div>` : `<div class="frase-exemplo">Gerando frase de exemplo...</div>`}
    `;
    grade.appendChild(cartao);
  });
}

// Adiciona uma nova palavra: salva no Firestore e pede a frase de exemplo à IA
async function adicionarPalavra(palavraEn, traducaoPt) {
  const user = auth.currentUser;
  if (!user || !palavraEn.trim() || !traducaoPt.trim()) return;

  const statusEl = document.getElementById("status-palavra");
  statusEl.textContent = "Salvando...";

  const ref = await db.collection("usuarios").doc(user.uid).collection("palavras").add({
    palavraEn: palavraEn.trim(),
    traducaoPt: traducaoPt.trim(),
    fraseExemplo: "",
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("input-palavra-en").value = "";
  document.getElementById("input-palavra-pt").value = "";
  statusEl.textContent = "";

  // Pede a frase de exemplo à function do Vercel (a chave da IA fica só lá no servidor)
  try {
    const resposta = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palavra: palavraEn.trim(), traducao: traducaoPt.trim() })
    });
    const dados = await resposta.json();
    if (dados.frase) {
      await db.collection("usuarios").doc(user.uid).collection("palavras").doc(ref.id)
        .update({ fraseExemplo: dados.frase });
    }
  } catch (e) {
    console.warn("Não foi possível gerar a frase de exemplo agora:", e);
  }
}

async function removerPalavra(id) {
  const user = auth.currentUser;
  if (!user) return;
  await db.collection("usuarios").doc(user.uid).collection("palavras").doc(id).delete();
}

// Carrega as mensagens/dicas que o professor deixou para este aluno
function carregarMensagensDoProfessor(uid) {
  db.collection("usuarios").doc(uid).collection("mensagens")
    .orderBy("criadoEm", "desc")
    .onSnapshot((snapshot) => {
      const container = document.getElementById("lista-mensagens");
      const painel = document.getElementById("painel-mensagens");
      if (snapshot.empty) {
        painel.classList.add("oculto");
        return;
      }
      painel.classList.remove("oculto");
      container.innerHTML = "";
      snapshot.docs.forEach((doc) => {
        const m = doc.data();
        const data = m.criadoEm ? m.criadoEm.toDate().toLocaleDateString("pt-BR") : "";
        const div = document.createElement("div");
        div.className = "mensagem-item";
        div.innerHTML = `${m.texto}<span class="data-msg">${data}</span>`;
        container.appendChild(div);
      });
    });
}
