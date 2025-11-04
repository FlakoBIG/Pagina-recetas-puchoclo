import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function qs(id) { return document.getElementById(id); }

/* ===============================
   Estado de filtros (texto + colección)
================================== */
let currentSearch = "";
let currentCollectionFilter = ""; // "" = Todas

/* ===============================
   Firestore helpers
================================== */
async function safeQueryRecetas() {
  const col = collection(db, "recetas");
  try {
    return await getDocs(query(col, orderBy("createdAt", "desc")));
  } catch {
    return await getDocs(col);
  }
}

/* ===============================
   Utilidades
================================== */
function normalizeLines(txt) {
  return (txt || "")
    .split(/\r?\n/)
    .map(s => s.replace(/^[-•\d\)\.]+\s*/, "").trim())
    .filter(Boolean);
}

/* ===============================
   Búsqueda + Filtro (en cliente)
================================== */
function applyFilters(recipesContainer) {
  const term = currentSearch.toLowerCase();
  const wantedCol = currentCollectionFilter; // "" = todas

  recipesContainer.querySelectorAll(".recipe-card").forEach(card => {
    const name = card.querySelector("h3")?.textContent.toLowerCase() || "";
    const cardColId = card.dataset.collectionId || "";
    const matchText = name.includes(term);
    const matchCol  = !wantedCol || cardColId === wantedCol;
    card.style.display = (matchText && matchCol) ? "" : "none";
  });
}

function attachSearch(recipesContainer, searchInput) {
  if (!searchInput || !recipesContainer) return;
  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value || "";
    applyFilters(recipesContainer);
  });
}

function attachCollectionFilter(recipesContainer, selectEl) {
  if (!selectEl || !recipesContainer) return;
  selectEl.addEventListener("change", () => {
    currentCollectionFilter = selectEl.value || "";
    applyFilters(recipesContainer);
  });
}

/* ===============================
   Render de tarjetas
================================== */
async function renderList() {
  const recipesContainer = qs("recipesContainer");
  if (!recipesContainer) return;

  recipesContainer.innerHTML = "<p class='meta'>Cargando recetas…</p>";
  const snap = await safeQueryRecetas();
  recipesContainer.innerHTML = "";

  snap.forEach(docRef => {
    const r = docRef.data();
    const art = document.createElement("article");
    art.className = "recipe-card";
    art.dataset.collectionId = r.collectionId || ""; // 👈 para filtrar

    const porc = (r.porciones ?? r.raciones ?? 0);

    art.innerHTML = `
      <img src="${r.imagen || ""}" class="recipe-img" alt="${r.nombre || ""}">
      <div class="recipe-info">
        <h3>${r.nombre || "Sin título"}</h3>
        <div class="meta">
          <span class="badge">⏱️ ${r.tiempo || "—"}</span>
          ${porc > 0 ? `<span class="badge">🍰 ${porc} porciones</span>` : ""}
          ${r.collectionName ? `<span class="badge">📚 ${r.collectionName}</span>` : ""}
        </div>
      </div>
    `;
    art.addEventListener("click", () => {
      window.location.href = `detalle.html?id=${docRef.id}`;
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

  // aplica filtros actuales (por si había texto o colección seleccionada)
  applyFilters(recipesContainer);
}

/* ===============================
   Select de colecciones (modal crear)
================================== */
async function loadCollectionsForCreateSelect() {
  const sel = qs("collectionSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">(Sin colección)</option>`;
  try {
    const snap = await getDocs(query(collection(db, "colecciones"), orderBy("name", "asc")));
    snap.forEach(d => {
      const data = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = data?.name || "(sin nombre)";
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando colecciones (crear):", e);
  }
}

/* ===============================
   Select de colecciones (filtro)
================================== */
async function loadCollectionsForFilter() {
  const sel = qs("filterCollection");
  if (!sel) return;
  sel.innerHTML = `<option value="">(Todas)</option>`;
  try {
    const snap = await getDocs(query(collection(db, "colecciones"), orderBy("name", "asc")));
    snap.forEach(d => {
      const data = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = data?.name || "(sin nombre)";
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando colecciones (filtro):", e);
  }
}

/* ===============================
   Modal crear receta
================================== */
function attachModal() {
  const addBtn = qs("addRecipeBtn");
  const dialog = qs("recipeDialog");
  const cancel = qs("cancelDialogBtn");
  if (!addBtn || !dialog || !cancel) return;

  if (typeof dialog.showModal !== "function") {
    dialog.showModal = () => dialog.classList.remove("hidden");
    dialog.close = () => dialog.classList.add("hidden");
    dialog.classList.add("hidden");
  }

  addBtn.addEventListener("click", async () => {
    await loadCollectionsForCreateSelect();
    dialog.showModal();
  });
  cancel.addEventListener("click", () => dialog.close());
}

/* ===============================
   Crear receta
================================== */
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
    const porcionesV = parseInt(qs("porciones")?.value, 10);
    const imagenUrl = qs("imagenUrl")?.value.trim();
    const ingText   = qs("ingredientes")?.value.trim();
    const pasosText = qs("pasos")?.value.trim();

    const sel = qs("collectionSelect");
    const collectionId = sel?.value || "";
    const collectionName = sel && sel.selectedOptions && sel.selectedOptions[0]
      ? sel.selectedOptions[0].textContent
      : "";

    if (!titulo || !tiempo || !imagenUrl) {
      if (msg) msg.textContent = "Completa título, tiempo e imagen (porciones es opcional).";
      return;
    }

    try {
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Guardando…"; }
      const docData = {
        nombre: titulo,
        tiempo,
        porciones: isNaN(porcionesV) || porcionesV < 0 ? 0 : porcionesV,
        imagen: imagenUrl,
        ingredientes: normalizeLines(ingText),
        pasos: normalizeLines(pasosText),
        createdAt: serverTimestamp(),
        collectionId: collectionId || null,
        collectionName: collectionId ? collectionName : null
      };
      await addDoc(collection(db, "recetas"), docData);

      form.reset();
      const porcInput = qs("porciones");
      if (porcInput) porcInput.value = "0";
      const selEl = qs("collectionSelect");
      if (selEl) selEl.selectedIndex = 0;

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

/* ===============================
   Init
================================== */
async function init() {
  attachModal();
  attachCreate();

  const recipesContainer = qs("recipesContainer");
  const searchInput = qs("searchInput");
  const filterSelect = qs("filterCollection");

  attachSearch(recipesContainer, searchInput);
  attachCollectionFilter(recipesContainer, filterSelect);

  await loadCollectionsForFilter();
  await renderList();
}

/* ---------- Numeración automática ---------- */
function autoFormatTextareas() {
  const ing = document.getElementById("ingredientes");
  const pasos = document.getElementById("pasos");

  if (ing) {
    if (!ing.value.trim()) ing.value = "• ";
    ing.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ing.value += "\n• ";
        setTimeout(() => { ing.selectionStart = ing.selectionEnd = ing.value.length; }, 0);
      }
    });
  }

  if (pasos) {
    if (!pasos.value.trim()) pasos.value = "1) ";
    pasos.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const count = pasos.value.split(/\r?\n/).filter(l => l.trim().length).length;
        pasos.value += `\n${count + 1}) `;
        setTimeout(() => { pasos.selectionStart = pasos.selectionEnd = pasos.value.length; }, 0);
      }
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  autoFormatTextareas();
  init().catch(err => console.error("Init error:", err));
});
