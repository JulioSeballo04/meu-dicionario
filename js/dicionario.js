// ============================================================
// DICIONÁRIO DO ALUNO
// ============================================================

let letraSelecionada = "INICIO";
let cacheDePalavras = [];
let cacheDeAnotacoes = [];
let nomeDoAlunoAtual = "";
let anotacaoEmEdicaoId = null;

exigirLogin("aluno");

auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  const perfil = await db.collection("usuarios").doc(user.uid).get();
  nomeDoAlunoAtual = perfil.data().nome;
  carregarMensagensDoProfessor(user.uid);
  escutarAnotacoes(user.uid);
  escutarPalavras(user.uid);
});

// Escuta em tempo real as anotações pessoais do aluno (um único listener; re-renderiza ao editar)
function escutarAnotacoes(uid) {
  db.collection("usuarios").doc(uid).collection("anotacoes")
    .orderBy("criadoEm", "desc")
    .onSnapshot((snapshot) => {
      cacheDeAnotacoes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderizarAnotacoes();
    });
}

function renderizarAnotacoes() {
  const container = document.getElementById("lista-anotacoes");
  container.innerHTML = "";
  cacheDeAnotacoes.forEach((a) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-anotacao";

    if (anotacaoEmEdicaoId === a.id) {
      cartao.innerHTML = `
        <div class="edicao-anotacao">
          <textarea id="edicao-texto-${a.id}">${a.texto}</textarea>
          <button class="btn btn-primario" style="padding:0.4em 1em; font-size:0.85rem;" onclick="salvarEdicaoAnotacao('${a.id}')">Salvar</button>
          <button class="btn btn-secundario" style="padding:0.4em 1em; font-size:0.85rem;" onclick="cancelarEdicaoAnotacao()">Cancelar</button>
        </div>
      `;
    } else {
      cartao.innerHTML = `
        <div class="acoes-anotacao">
          <button onclick="editarAnotacao('${a.id}')">Editar</button>
          <button class="excluir" onclick="excluirAnotacao('${a.id}')">Excluir</button>
        </div>
        ${a.texto}
      `;
    }
    container.appendChild(cartao);
  });
}

// Adiciona uma nova anotação
async function adicionarAnotacao(texto) {
  const user = auth.currentUser;
  if (!user || !texto.trim()) return;
  await db.collection("usuarios").doc(user.uid).collection("anotacoes").add({
    texto: texto.trim(),
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  document.getElementById("input-anotacoes").value = "";
}

function editarAnotacao(id) {
  anotacaoEmEdicaoId = id;
  renderizarAnotacoes();
}

function cancelarEdicaoAnotacao() {
  anotacaoEmEdicaoId = null;
  renderizarAnotacoes();
}

async function salvarEdicaoAnotacao(id) {
  const user = auth.currentUser;
  if (!user) return;
  const novoTexto = document.getElementById(`edicao-texto-${id}`).value.trim();
  if (!novoTexto) return;
  await db.collection("usuarios").doc(user.uid).collection("anotacoes").doc(id)
    .update({ texto: novoTexto });
  anotacaoEmEdicaoId = null;
}

async function excluirAnotacao(id) {
  const user = auth.currentUser;
  if (!user) return;
  await db.collection("usuarios").doc(user.uid).collection("anotacoes").doc(id).delete();
}

// Escuta em tempo real a coleção de palavras do aluno logado
function escutarPalavras(uid) {
  db.collection("usuarios").doc(uid).collection("palavras")
    .orderBy("palavraEn")
    .onSnapshot((snapshot) => {
      cacheDePalavras = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      montarIndiceLetras();
      renderizarTela();
    });
}

// Monta as abas do menu lateral: "Início" + A-Z, marcando quantas palavras tem cada letra
function montarIndiceLetras() {
  const contagemPorLetra = {};
  cacheDePalavras.forEach((p) => {
    const letra = p.palavraEn[0].toUpperCase();
    contagemPorLetra[letra] = (contagemPorLetra[letra] || 0) + 1;
  });

  const container = document.getElementById("indice-letras-lista");
  container.innerHTML = "";

  const inicio = document.createElement("button");
  inicio.className = "letra-tab" + (letraSelecionada === "INICIO" ? " ativa" : "");
  inicio.textContent = "🏠";
  inicio.title = "Início";
  inicio.onclick = () => { letraSelecionada = "INICIO"; montarIndiceLetras(); renderizarTela(); };
  container.appendChild(inicio);

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((letra) => {
    const qtd = contagemPorLetra[letra] || 0;
    const btn = document.createElement("button");
    let classe = "letra-tab";
    if (letra === letraSelecionada) classe += " ativa";
    if (qtd > 0) classe += " tem-palavras";
    btn.className = classe;
    btn.title = qtd > 0 ? `${qtd} palavra(s)` : "Nenhuma palavra ainda";
    btn.innerHTML = qtd > 0
      ? `${letra}<span class="contagem-letra">${qtd}</span>`
      : letra;
    btn.onclick = () => { letraSelecionada = letra; montarIndiceLetras(); renderizarTela(); };
    container.appendChild(btn);
  });
}

// Decide o que mostrar no topo e no corpo da página, dependendo da tela ativa
function renderizarTela() {
  const painelMensagens = document.getElementById("painel-mensagens");
  const painelAnotacoes = document.getElementById("painel-anotacoes");
  const tituloTopo = document.getElementById("titulo-topo");
  const eyebrowTopo = document.getElementById("eyebrow-topo");
  const contadorTotal = document.getElementById("contador-total");

  if (letraSelecionada === "INICIO") {
    eyebrowTopo.textContent = "SEU VOCABULÁRIO";
    tituloTopo.textContent = nomeDoAlunoAtual || "Olá!";
    painelMensagens.classList.remove("forcar-oculto");
    painelAnotacoes.classList.remove("forcar-oculto");
    contadorTotal.classList.remove("forcar-oculto");
    contadorTotal.textContent = cacheDePalavras.length === 1
      ? "1 palavra aprendida"
      : `${cacheDePalavras.length} palavras aprendidas`;
  } else {
    eyebrowTopo.textContent = "VOCABULÁRIO";
    tituloTopo.textContent = `Palavras aprendidas com a inicial "${letraSelecionada}"`;
    painelMensagens.classList.add("forcar-oculto");
    painelAnotacoes.classList.add("forcar-oculto");
    contadorTotal.classList.add("forcar-oculto");
  }
  renderizarPalavras();
}

function renderizarPalavras() {
  const grade = document.getElementById("grade-cartoes");
  grade.innerHTML = "";

  // Na tela Início não mostramos a lista de palavras — só nas telas de cada letra
  if (letraSelecionada === "INICIO") return;

  const lista = cacheDePalavras.filter((p) => p.palavraEn[0].toUpperCase() === letraSelecionada);

  if (lista.length === 0) {
    grade.innerHTML = `<p class="vazio">Nenhuma palavra aqui ainda. Adicione uma acima!</p>`;
    return;
  }

  lista.forEach((p) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-palavra";

    const frases = p.frasesExemplo && p.frasesExemplo.length > 0
      ? p.frasesExemplo.map((f) => `<div class="frase-exemplo">"${f.en}"${f.pt ? `<br><span class="frase-traducao">${f.pt}</span>` : ""}</div>`).join("")
      : `<div class="frase-exemplo">Gerando frases de exemplo...</div>`;

    cartao.innerHTML = `
      <button class="remover" title="Remover" onclick="removerPalavra('${p.id}')">✕</button>
      <div class="palavra-en">${p.palavraEn}</div>
      <div class="palavra-pt">${p.traducaoPt}</div>
      ${frases}
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
    frasesExemplo: [],
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("input-palavra-en").value = "";
  document.getElementById("input-palavra-pt").value = "";
  statusEl.textContent = "";

  // Pede as 5 frases de exemplo à function do Vercel (a chave da IA fica só lá no servidor)
  try {
    const resposta = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palavra: palavraEn.trim(), traducao: traducaoPt.trim() })
    });
    const dados = await resposta.json();
    if (dados.frases && dados.frases.length > 0) {
      await db.collection("usuarios").doc(user.uid).collection("palavras").doc(ref.id)
        .update({ frasesExemplo: dados.frases });
    }
  } catch (e) {
    console.warn("Não foi possível gerar as frases de exemplo agora:", e);
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
        div.innerHTML = `${m.texto}<br><span class="data-msg">${data}</span>`;
        container.appendChild(div);
      });
    });
}
