// ============================================================
// PAINEL DO PROFESSOR
// ============================================================
// Cada aluno é um bloco de "acordeão": clica para abrir/fechar.
// Dentro do bloco, três abas: Vocabulário (por letra), Recados
// e Relatório de aulas. O sistema guarda, por aluno e por letra,
// a última vez que o professor abriu aquela letra — o destaque
// de "novidade" (bolinha âmbar) some só na letra clicada, não
// no aluno inteiro.
// ============================================================

let professorIdAtual = null;
let alunosCache = []; // [{id, nome, ...}]
const estadoAlunos = {}; // por alunoId: ver garantirEstado()

exigirLogin("professor");

auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  professorIdAtual = user.uid;
  const perfil = (await db.collection("usuarios").doc(user.uid).get()).data();
  document.getElementById("nome-usuario").textContent = perfil.nome;
  document.getElementById("codigo-professor").textContent = perfil.codigoProfessor;
  carregarAlunos(user.uid);
});

function garantirEstado(alunoId) {
  if (!estadoAlunos[alunoId]) {
    estadoAlunos[alunoId] = {
      aberto: false,
      abaAtiva: "vocabulario",       // vocabulario | recados | relatorio
      letraSelecionada: "TODAS",
      palavras: [],
      mensagens: [],
      relatorios: [],
      unsubPalavras: null,
      unsubMensagens: null,
      unsubRelatorios: null,
      letrasVistas: null,            // {A: Timestamp, B: Timestamp, ...} última vez que cada letra foi aberta
      temNovidade: false,
      letrasNovas: new Set(),
      mensagemEmEdicaoId: null
    };
  }
  return estadoAlunos[alunoId];
}

// -------------------- LISTA DE ALUNOS --------------------

function carregarAlunos(professorId) {
  db.collection("usuarios")
    .where("tipo", "==", "aluno")
    .where("professorId", "==", professorId)
    .onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        alunosCache = [];
        document.getElementById("lista-alunos").innerHTML =
          `<p class="vazio">Nenhum aluno vinculado ainda. Compartilhe seu código acima.</p>`;
        return;
      }

      alunosCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      for (const aluno of alunosCache) {
        const estado = garantirEstado(aluno.id);

        // Busca (uma única vez) as letras já vistas desse aluno
        if (estado.letrasVistas === null) {
          await carregarLetrasVistas(aluno.id);
        }

        // Mantém um listener sempre ativo nas palavras de cada aluno vinculado,
        // para o destaque de novidade funcionar em tempo real, mesmo com o bloco fechado.
        if (!estado.unsubPalavras) {
          estado.unsubPalavras = db.collection("usuarios").doc(aluno.id).collection("palavras")
            .orderBy("palavraEn")
            .onSnapshot((snap) => {
              estado.palavras = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              calcularNovidades(aluno.id);
              renderizarListaAlunos();
            });
        }
      }

      renderizarListaAlunos();
    });
}

async function carregarLetrasVistas(alunoId) {
  const estado = estadoAlunos[alunoId];
  const ref = db.collection("usuarios").doc(professorIdAtual).collection("visualizacoes").doc(alunoId);
  const visSnap = await ref.get();

  if (visSnap.exists && visSnap.data().letras) {
    estado.letrasVistas = visSnap.data().letras;
  } else {
    // Primeira vez que esse aluno passa pelo sistema de novidades: grava "agora" em
    // todas as letras, como marco inicial, para não marcar palavras antigas como novas.
    const agora = firebase.firestore.Timestamp.now();
    const letras = {};
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((l) => { letras[l] = agora; });
    await ref.set({ letras });
    estado.letrasVistas = letras;
  }
  calcularNovidades(alunoId);
}

// Marca uma letra específica como vista agora — some o destaque só dela
async function marcarLetraComoVista(alunoId, letra) {
  const estado = estadoAlunos[alunoId];
  const agora = firebase.firestore.Timestamp.now();

  estado.letrasVistas[letra] = agora;
  estado.letrasNovas.delete(letra);
  estado.temNovidade = estado.letrasNovas.size > 0;

  await db.collection("usuarios").doc(professorIdAtual).collection("visualizacoes")
    .doc(alunoId).update({ [`letras.${letra}`]: agora });
}

// Verifica, letra por letra, quais têm palavra criada depois da última vez que foi vista
function calcularNovidades(alunoId) {
  const estado = estadoAlunos[alunoId];
  if (!estado.letrasVistas) return;

  const letrasNovas = new Set();

  estado.palavras.forEach((p) => {
    const letra = p.palavraEn[0].toUpperCase();
    const vistoEm = estado.letrasVistas[letra];
    if (!vistoEm || (p.criadoEm && p.criadoEm.toMillis() > vistoEm.toMillis())) {
      letrasNovas.add(letra);
    }
  });

  estado.letrasNovas = letrasNovas;
  estado.temNovidade = letrasNovas.size > 0;
}

function renderizarListaAlunos() {
  const lista = document.getElementById("lista-alunos");
  lista.innerHTML = "";

  alunosCache.forEach((aluno) => {
    const estado = garantirEstado(aluno.id);

    const bloco = document.createElement("div");
    bloco.className = "aluno-bloco";

    const header = document.createElement("div");
    header.className = "item-aluno" + (estado.aberto ? " aberto" : "");
    header.innerHTML = `
      <span class="nome-aluno">
        ${aluno.nome}
        ${estado.temNovidade ? '<span class="badge-novidade" title="Tem palavra nova"></span>' : ""}
      </span>
      <span class="cabecalho-direita">
        <span class="contagem">${estado.palavras.length} palavra(s)</span>
        <span class="seta-expandir">▾</span>
      </span>
    `;
    header.onclick = () => alternarAluno(aluno.id);
    bloco.appendChild(header);

    if (estado.aberto) {
      const detalhe = document.createElement("div");
      detalhe.className = "detalhe-aluno-inline";
      detalhe.innerHTML = montarHtmlDetalheAluno(aluno.id);
      bloco.appendChild(detalhe);
    }

    lista.appendChild(bloco);
  });
}

// -------------------- ABRIR / FECHAR (ACORDEÃO) --------------------

async function alternarAluno(alunoId) {
  const estado = garantirEstado(alunoId);
  estado.aberto = !estado.aberto;

  if (estado.aberto) {
    ativarListenersDetalheAluno(alunoId);
  } else {
    desativarListenersDetalheAluno(alunoId);
  }

  renderizarListaAlunos();
}

function ativarListenersDetalheAluno(alunoId) {
  const estado = estadoAlunos[alunoId];

  if (!estado.unsubMensagens) {
    estado.unsubMensagens = db.collection("usuarios").doc(alunoId).collection("mensagens")
      .orderBy("criadoEm", "desc")
      .onSnapshot((snap) => {
        estado.mensagens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (estado.aberto) renderizarListaAlunos();
      });
  }

  if (!estado.unsubRelatorios) {
    estado.unsubRelatorios = db.collection("usuarios").doc(alunoId).collection("relatorios")
      .orderBy("criadoEm", "desc")
      .onSnapshot((snap) => {
        estado.relatorios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (estado.aberto) renderizarListaAlunos();
      });
  }
}

function desativarListenersDetalheAluno(alunoId) {
  const estado = estadoAlunos[alunoId];
  if (estado.unsubMensagens) { estado.unsubMensagens(); estado.unsubMensagens = null; }
  if (estado.unsubRelatorios) { estado.unsubRelatorios(); estado.unsubRelatorios = null; }
}

// -------------------- DETALHE DO ALUNO (ABAS) --------------------

function montarHtmlDetalheAluno(alunoId) {
  const estado = estadoAlunos[alunoId];

  const abas = `
    <div class="abas-detalhe">
      <button class="aba-detalhe ${estado.abaAtiva === "vocabulario" ? "ativa" : ""}"
        onclick="mudarAbaAluno('${alunoId}','vocabulario')">Vocabulário</button>
      <button class="aba-detalhe ${estado.abaAtiva === "recados" ? "ativa" : ""}"
        onclick="mudarAbaAluno('${alunoId}','recados')">Recados</button>
      <button class="aba-detalhe ${estado.abaAtiva === "relatorio" ? "ativa" : ""}"
        onclick="mudarAbaAluno('${alunoId}','relatorio')">Relatório de aulas</button>
    </div>
  `;

  let conteudo;
  if (estado.abaAtiva === "recados") conteudo = montarAbaRecados(alunoId);
  else if (estado.abaAtiva === "relatorio") conteudo = montarAbaRelatorio(alunoId);
  else conteudo = montarAbaVocabulario(alunoId);

  return abas + conteudo;
}

function mudarAbaAluno(alunoId, aba) {
  estadoAlunos[alunoId].abaAtiva = aba;
  renderizarListaAlunos();
}

// -------------------- ABA: VOCABULÁRIO (abecedário) --------------------

function montarAbaVocabulario(alunoId) {
  const estado = estadoAlunos[alunoId];

  const contagemPorLetra = {};
  estado.palavras.forEach((p) => {
    const letra = p.palavraEn[0].toUpperCase();
    contagemPorLetra[letra] = (contagemPorLetra[letra] || 0) + 1;
  });

  const letrasHtml = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letra) => {
    const qtd = contagemPorLetra[letra] || 0;
    let classe = "letra-tab-mini";
    if (estado.letraSelecionada === letra) classe += " ativa";
    if (qtd === 0) classe += " vazia";
    const temNovidadeLetra = estado.letrasNovas.has(letra);
    return `
      <button class="${classe}" ${qtd === 0 ? "disabled" : ""} onclick="selecionarLetraAluno('${alunoId}','${letra}')">
        ${letra}${qtd > 0 ? `<span class="contagem-letra-mini">${qtd}</span>` : ""}
        ${temNovidadeLetra ? '<span class="badge-novidade-letra"></span>' : ""}
      </button>
    `;
  }).join("");

  let listaPalavras;
  if (estado.letraSelecionada === "TODAS") {
    listaPalavras = `<p class="vazio">Selecione uma letra acima para ver as palavras.</p>`;
  } else {
    const filtradas = estado.palavras.filter((p) => p.palavraEn[0].toUpperCase() === estado.letraSelecionada);
    if (filtradas.length === 0) {
      listaPalavras = `<p class="vazio">Nenhuma palavra com essa letra ainda.</p>`;
    } else {
      listaPalavras = `<div class="grade-cartoes">` + filtradas.map((p) => {
        const frases = p.frasesExemplo && p.frasesExemplo.length > 0
          ? p.frasesExemplo.map((f) => {
              const en = typeof f === "string" ? f : f.en;
              const pt = typeof f === "string" ? "" : f.pt;
              return `<div class="frase-exemplo">"${en}"${pt ? `<br><span class="frase-traducao">${pt}</span>` : ""}</div>`;
            }).join("")
          : "";
        return `
          <div class="cartao-palavra">
            <div class="palavra-en">${p.palavraEn}</div>
            <div class="palavra-pt">${p.traducaoPt}</div>
            ${frases}
          </div>
        `;
      }).join("") + `</div>`;
    }
  }

  return `<div class="indice-letras-mini">${letrasHtml}</div>${listaPalavras}`;
}

function selecionarLetraAluno(alunoId, letra) {
  const estado = estadoAlunos[alunoId];
  const abrindo = estado.letraSelecionada !== letra;
  estado.letraSelecionada = abrindo ? letra : "TODAS";

  if (abrindo) {
    marcarLetraComoVista(alunoId, letra);
  }

  renderizarListaAlunos();
}

// -------------------- ABA: RECADOS (com editar/excluir) --------------------

function montarAbaRecados(alunoId) {
  const estado = estadoAlunos[alunoId];

  const formulario = `
    <div class="caixa-mensagem" style="margin-bottom:1rem;">
      <textarea id="input-mensagem-${alunoId}" placeholder="Ex: Revise os phrasal verbs desta semana!"></textarea>
      <button class="btn btn-primario" style="margin-top:0.6em;" onclick="enviarMensagem('${alunoId}')">Enviar recado</button>
    </div>
  `;

  if (estado.mensagens.length === 0) {
    return formulario + `<p class="vazio">Nenhum recado enviado ainda.</p>`;
  }

  const lista = estado.mensagens.map((m) => {
    if (estado.mensagemEmEdicaoId === m.id) {
      return `
        <div class="mensagem-item">
          <textarea id="edicao-msg-${m.id}">${m.texto}</textarea>
          <div style="display:flex; gap:0.5em;">
            <button class="btn btn-primario" style="padding:0.4em 1em; font-size:0.85rem;"
              onclick="salvarEdicaoMensagem('${alunoId}','${m.id}')">Salvar</button>
            <button class="btn btn-secundario" style="padding:0.4em 1em; font-size:0.85rem;"
              onclick="cancelarEdicaoMensagem('${alunoId}')">Cancelar</button>
          </div>
        </div>
      `;
    }
    const data = m.criadoEm ? m.criadoEm.toDate().toLocaleDateString("pt-BR") : "";
    return `
      <div class="mensagem-item">
        <div class="acoes-msg">
          <button onclick="editarMensagem('${alunoId}','${m.id}')">Editar</button>
          <button class="excluir" onclick="excluirMensagem('${alunoId}','${m.id}')">Excluir</button>
        </div>
        ${m.texto}<br><span class="data-msg">${data}</span>
      </div>
    `;
  }).join("");

  return formulario + lista;
}

function editarMensagem(alunoId, msgId) {
  estadoAlunos[alunoId].mensagemEmEdicaoId = msgId;
  renderizarListaAlunos();
}

function cancelarEdicaoMensagem(alunoId) {
  estadoAlunos[alunoId].mensagemEmEdicaoId = null;
  renderizarListaAlunos();
}

async function salvarEdicaoMensagem(alunoId, msgId) {
  const novoTexto = document.getElementById(`edicao-msg-${msgId}`).value.trim();
  if (!novoTexto) return;
  await db.collection("usuarios").doc(alunoId).collection("mensagens")
    .doc(msgId).update({ texto: novoTexto });
  estadoAlunos[alunoId].mensagemEmEdicaoId = null;
}

async function excluirMensagem(alunoId, msgId) {
  await db.collection("usuarios").doc(alunoId).collection("mensagens").doc(msgId).delete();
}

async function enviarMensagem(alunoId) {
  const input = document.getElementById(`input-mensagem-${alunoId}`);
  const texto = input.value.trim();
  if (!texto) return;
  await db.collection("usuarios").doc(alunoId).collection("mensagens").add({
    texto,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

// -------------------- ABA: RELATÓRIO DE AULAS --------------------

function montarAbaRelatorio(alunoId) {
  const estado = estadoAlunos[alunoId];

  const formulario = `
    <div class="caixa-mensagem" style="margin-bottom:1rem;">
      <textarea id="input-relatorio-${alunoId}" placeholder='Ex: Na aula de hoje trabalhamos num jogo de conhecimento de palavras novas.'></textarea>
      <button class="btn btn-primario" style="margin-top:0.6em;" onclick="adicionarRelatorio('${alunoId}')">Registrar aula</button>
    </div>
  `;

  if (estado.relatorios.length === 0) {
    return formulario + `<p class="vazio">Nenhum registro de aula ainda.</p>`;
  }

  const lista = estado.relatorios.map((r) => {
    const data = r.criadoEm ? r.criadoEm.toDate().toLocaleDateString("pt-BR") : "";
    return `
      <div class="mensagem-item">
        <div class="acoes-msg">
          <button class="excluir" onclick="excluirRelatorio('${alunoId}','${r.id}')">Excluir</button>
        </div>
        ${r.texto}<br><span class="data-msg">${data}</span>
      </div>
    `;
  }).join("");

  return formulario + lista;
}

async function adicionarRelatorio(alunoId) {
  const input = document.getElementById(`input-relatorio-${alunoId}`);
  const texto = input.value.trim();
  if (!texto) return;
  await db.collection("usuarios").doc(alunoId).collection("relatorios").add({
    texto,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  input.value = "";
}

async function excluirRelatorio(alunoId, relatorioId) {
  await db.collection("usuarios").doc(alunoId).collection("relatorios").doc(relatorioId).delete();
}

// -------------------- CÓDIGO DO PROFESSOR --------------------

function copiarCodigo() {
  const codigo = document.getElementById("codigo-professor").textContent;
  navigator.clipboard.writeText(codigo);
  const status = document.getElementById("status-copiar");
  status.textContent = "Copiado!";
  setTimeout(() => (status.textContent = ""), 1500);
}
