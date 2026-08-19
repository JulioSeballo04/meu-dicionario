// ============================================================
// PAINEL DO PROFESSOR
// ============================================================

let alunoSelecionadoId = null;

exigirLogin("professor");

auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  const perfil = (await db.collection("usuarios").doc(user.uid).get()).data();
  document.getElementById("nome-usuario").textContent = perfil.nome;
  document.getElementById("codigo-professor").textContent = perfil.codigoProfessor;
  carregarAlunos(user.uid);
});

function carregarAlunos(professorId) {
  db.collection("usuarios")
    .where("tipo", "==", "aluno")
    .where("professorId", "==", professorId)
    .onSnapshot(async (snapshot) => {
      const lista = document.getElementById("lista-alunos");
      lista.innerHTML = "";

      if (snapshot.empty) {
        lista.innerHTML = `<p class="vazio">Nenhum aluno vinculado ainda. Compartilhe seu código acima.</p>`;
        return;
      }

      for (const doc of snapshot.docs) {
        const aluno = doc.data();
        const palavrasSnap = await db.collection("usuarios").doc(doc.id).collection("palavras").get();

        const item = document.createElement("div");
        item.className = "item-aluno";
        item.innerHTML = `
          <span class="nome-aluno">${aluno.nome}</span>
          <span class="contagem">${palavrasSnap.size} palavra(s)</span>
        `;
        item.onclick = () => abrirDetalheAluno(doc.id, aluno.nome);
        lista.appendChild(item);
      }
    });
}

async function abrirDetalheAluno(alunoId, nomeAluno) {
  alunoSelecionadoId = alunoId;
  const painel = document.getElementById("painel-aluno-detalhe");
  painel.classList.remove("oculto");
  document.getElementById("nome-aluno-detalhe").textContent = nomeAluno;

  // Lista as palavras do aluno
  const palavrasSnap = await db.collection("usuarios").doc(alunoId)
    .collection("palavras").orderBy("palavraEn").get();

  const grade = document.getElementById("grade-palavras-aluno");
  grade.innerHTML = "";
  if (palavrasSnap.empty) {
    grade.innerHTML = `<p class="vazio">Este aluno ainda não adicionou palavras.</p>`;
  } else {
    palavrasSnap.docs.forEach((doc) => {
      const p = doc.data();
      const frases = p.frasesExemplo && p.frasesExemplo.length > 0
        ? p.frasesExemplo.map((f) => `<div class="frase-exemplo">"${f.en}"${f.pt ? `<br><span class="frase-traducao">${f.pt}</span>` : ""}</div>`).join("")
        : "";
      const cartao = document.createElement("div");
      cartao.className = "cartao-palavra";
      cartao.innerHTML = `
        <div class="palavra-en">${p.palavraEn}</div>
        <div class="palavra-pt">${p.traducaoPt}</div>
        ${frases}
      `;
      grade.appendChild(cartao);
    });
  }

  carregarMensagensEnviadas(alunoId);
  carregarAnotacoesDoAluno(alunoId);
  window.scrollTo({ top: painel.offsetTop - 20, behavior: "smooth" });
}

// Mostra as anotações pessoais do aluno (somente leitura — o professor não edita)
function carregarAnotacoesDoAluno(alunoId) {
  db.collection("usuarios").doc(alunoId).collection("anotacoes")
    .orderBy("criadoEm", "desc")
    .onSnapshot((snapshot) => {
      const container = document.getElementById("lista-anotacoes-aluno");
      const painel = document.getElementById("painel-anotacoes-aluno");
      if (snapshot.empty) {
        painel.classList.add("oculto");
        return;
      }
      painel.classList.remove("oculto");
      container.innerHTML = "";
      snapshot.docs.forEach((doc) => {
        const a = doc.data();
        const div = document.createElement("div");
        div.className = "cartao-anotacao";
        div.style.paddingRight = "1em";
        div.textContent = a.texto;
        container.appendChild(div);
      });
    });
}

async function enviarMensagem(texto) {
  if (!alunoSelecionadoId || !texto.trim()) return;
  await db.collection("usuarios").doc(alunoSelecionadoId).collection("mensagens").add({
    texto: texto.trim(),
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  document.getElementById("input-mensagem").value = "";
}

function carregarMensagensEnviadas(alunoId) {
  db.collection("usuarios").doc(alunoId).collection("mensagens")
    .orderBy("criadoEm", "desc")
    .onSnapshot((snapshot) => {
      const container = document.getElementById("lista-mensagens-enviadas");
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

function copiarCodigo() {
  const codigo = document.getElementById("codigo-professor").textContent;
  navigator.clipboard.writeText(codigo);
  const status = document.getElementById("status-copiar");
  status.textContent = "Copiado!";
  setTimeout(() => (status.textContent = ""), 1500);
}
