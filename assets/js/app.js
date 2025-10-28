import { db } from "./firebase.js";

import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function qs(id) { return document.getElementById(id); }

async function safeQueryRecetas() {
  // Intenta ordenar por createdAt; si falla, hace fallback sin ordenar
  const col = collection(db, "recetas");
  try {
    return await getDocs(query(col, orderBy("createdAt", "desc")));
  } catch (e) {
    console.warn("orderBy(createdAt) falló, usando fallback sin orden:", e);
    return await getDocs(col);
  }
}

function normalizeLines(txt) {
  return (txt || "")
    .split(/\r?\n/)
    .map(s => s.replace(/^[-•\d\)\.]+\s*/, "").trim())
    .filter(Boolean);
}

function attachSearch(recipesContainer, searchInput) {
  if (!searchInput || !recipesContainer) return;
  searchInput.addEventListener("input", () => {
    const term = searchInput.value.toLowerCase();
    recipesContainer.querySelectorAll(".recipe-card").forEach(card => {
      const name = card.querySelector("h3")?.textContent.toLowerCase() || "";
      card.style.display = name.includes(term) ? "" : "none";
    });
  });
}

async function renderList() {
  const recipesContainer = qs("recipesContainer");
  if (!recipesContainer) return;

  recipesContainer.innerHTML = "<p class='meta'>Cargando recetas…</p>";
  const snap = await safeQueryRecetas();
  recipesContainer.innerHTML = "";

  snap.forEach(doc => {
    const r = doc.data();
    const art = document.createElement("article");
    art.className = "recipe-card";
    art.innerHTML = `
      <img src="${r.imagen || ""}" class="recipe-img" alt="${r.nombre || ""}">
      <div class="recipe-info">
        <h3>${r.nombre || "Sin título"}</h3>
        <div class="meta">
          <span class="badge">⏱️ ${r.tiempo || "—"}</span>
          <span class="badge">👥 ${r.raciones ?? "—"} raciones</span>
        </div>
      </div>
    `;
    art.addEventListener("click", () => {
      window.location.href = `detalle.html?id=${doc.id}`;
    });
    recipesContainer.appendChild(art);
  });

  if (!snap.size) {
    recipesContainer.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🍿</div>
        <div class="title">Aún no hay recetas</div>
        <div class="hint">Toca el botón “＋” para crear tu primera receta mi puchoclito lida muask.</div>
      </div>
    `;
  }

}

function attachModal() {
  const addBtn = qs("addRecipeBtn");
  const dialog = qs("recipeDialog");
  const cancel = qs("cancelDialogBtn");
  if (!addBtn || !dialog || !cancel) return;

  // Por si el navegador no soporta <dialog>
  if (typeof dialog.showModal !== "function") {
    dialog.showModal = () => dialog.classList.remove("hidden");
    dialog.close = () => dialog.classList.add("hidden");
    dialog.classList.add("hidden");
  }

  addBtn.addEventListener("click", () => dialog.showModal());
  cancel.addEventListener("click", () => dialog.close());
}

function attachCreate() {
  const form = qs("recipeForm");
  const msg  = qs("formMsg");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "";

    const saveBtn   = qs("saveRecipeBtn");
    const titulo    = qs("titulo")?.value.trim();
    const tiempo    = qs("tiempo")?.value.trim();
    const raciones  = parseInt(qs("raciones")?.value, 10);
    const imagenUrl = qs("imagenUrl")?.value.trim();
    const ingText   = qs("ingredientes")?.value.trim();
    const pasosText = qs("pasos")?.value.trim();

    if (!titulo || !tiempo || !raciones || !imagenUrl) {
      if (msg) msg.textContent = "Completa título, tiempo, raciones e imagen.";
      return;
    }

    try {
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Guardando…"; }
      const docData = {
        nombre: titulo,
        tiempo,
        raciones,
        imagen: imagenUrl,
        ingredientes: normalizeLines(ingText),
        pasos: normalizeLines(pasosText),
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "recetas"), docData);

      form.reset();
      qs("recipeDialog")?.close();
      await renderList();
    } catch (err) {
      console.error(err);
      if (msg) msg.textContent = "Error al guardar. Revisa la consola.";
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Guardar"; }
    }
  });
}

function init() {
  // Asegura que el DOM está listo antes de buscar elementos
  attachModal();
  attachCreate();
  attachSearch(qs("recipesContainer"), qs("searchInput"));
  renderList().catch(err => {
    console.error("Error al cargar recetas:", err);
  });
}
/* ---------- Numeración automática ---------- */
function autoNumerarTextareas() {
  const ing = document.getElementById("ingredientes");
  const pasos = document.getElementById("pasos");

  function addNumbering(el) {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const lines = el.value.split("\n");
        const next = lines.length + 1;
        el.value += `\n${next}) `;
        // mueve el cursor al final
        setTimeout(() => {
          el.selectionStart = el.selectionEnd = el.value.length;
        }, 0);
      }
    });
    // si empieza vacío, agrega el 1)
    if (!el.value.trim()) el.value = "1) ";
  }

  addNumbering(ing);
  addNumbering(pasos);
}

window.addEventListener("DOMContentLoaded", () => {
  autoNumerarTextareas();
});

window.addEventListener("DOMContentLoaded", init);
