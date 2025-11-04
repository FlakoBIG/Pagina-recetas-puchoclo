import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function qs(id) { return document.getElementById(id); }

/* ===============================
   Estado de filtros (texto + categoría)
================================== */
let currentSearch = "";
let currentCategoryFilter = ""; // "" = Todas

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
  const term = (currentSearch || "").toLowerCase();
  const wantedCat = currentCategoryFilter; // "" = todas

  recipesContainer.querySelectorAll(".recipe-card").forEach(card => {
    const name = card.querySelector("h3")?.textContent.toLowerCase() || "";
    const cardCatName = card.dataset.categoryName || ""; // nombre de categoría
    const matchText = name.includes(term);
    const matchCat  = !wantedCat || cardCatName === wantedCat;
    card.style.display = (matchText && matchCat) ? "" : "none";
  });
}

function attachSearch(recipesContainer, searchInput) {
  if (!searchInput || !recipesContainer) return;
  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value || "";
    applyFilters(recipesContainer);
  });
}

function attachCategoryFilter(recipesContainer, selectEl) {
  if (!selectEl || !recipesContainer) return;
  selectEl.addEventListener("change", () => {
    currentCategoryFilter = selectEl.value || "";
    applyFilters(recipesContainer);
  });
}

/* ===============================
   Render de tarjetas
   - Backwards compat:
     usa r.categoria || r.collectionName para mostrar y filtrar
================================== */
async function renderList() {
  const recipesContainer = qs("recipesContainer");
  if (!recipesContainer) return;

  recipesContainer.innerHTML = "<p class='meta'>Cargando recetas…</p>";
  const snap = await safeQueryRecetas();
  recipesContainer.innerHTML = "";

  snap.forEach(docRef => {
    const r = docRef.data();

    // Compatibilidad: nombre de categoría que mostraremos/filtraremos
    const categoryName = (r.categoria || r.collectionName || "").trim();

    const art = document.createElement("article");
    art.className = "recipe-card";
    art.dataset.categoryName = categoryName; // 👈 para el filtro por nombre

    const porc = (r.porciones ?? r.raciones ?? 0);

    art.innerHTML = `
      <img src="${r.imagen || ""}" class="recipe-img" alt="${r.nombre || ""}">
      <div class="recipe-info">
        <h3>${r.nombre || "Sin título"}</h3>
        <div class="meta">
          <span class="badge">⏱️ ${r.tiempo || "—"}</span>
          ${porc > 0 ? `<span class="badge">🍰 ${porc} porciones</span>` : ""}
          ${categoryName ? `<span class="badge">📚 ${categoryName}</span>` : ""}
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

  // aplica filtros actuales (por si había texto o categoría seleccionada)
  applyFilters(recipesContainer);
}

/* ===============================
   Select de categorías (modal crear)
================================== */
async function loadCategoriesForCreateSelect() {
  const sel = qs("categorySelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">(Sin categoría)</option>`;
  try {
    const snap = await getDocs(query(collection(db, "categorias"), orderBy("name", "asc")));
    snap.forEach(d => {
      const data = d.data();
      const opt = document.createElement("option");
      // Usamos el NOMBRE como value para guardar directamente en 'categoria'
      opt.value = (data?.name || "").trim();
      opt.textContent = data?.name || "(sin nombre)";
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando categorías (crear):", e);
  }
}

/* ===============================
   Select de categorías (filtro)
   - filtra por NOMBRE
================================== */
async function loadCategoriesForFilter() {
  const sel = qs("filterCategory");
  if (!sel) return;
  sel.innerHTML = `<option value="">(Todas)</option>`;
  try {
    const snap = await getDocs(query(collection(db, "categorias"), orderBy("name", "asc")));
    snap.forEach(d => {
      const data = d.data();
      const name = (data?.name || "").trim();
      if (!name) return;
      const opt = document.createElement("option");
      opt.value = name;       // filtraremos contra dataset.categoryName
      opt.textContent = name;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error("Error cargando categorías (filtro):", e);
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
    await loadCategoriesForCreateSelect();
    dialog.showModal();
  });
  cancel.addEventListener("click", () => dialog.close());
}

/* ===============================
   Crear receta
   - guarda 'categoria' (string)
   - deja de usar collectionId/collectionName
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

    const sel = qs("categorySelect");
    const categoria = (sel?.value || "").trim(); // nombre de la categoría seleccionada, o vacío

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
        // Nuevo esquema:
        categoria: categoria || null
        // Compat: NO guardamos más collectionId/collectionName en nuevas recetas
      };
      await addDoc(collection(db, "recetas"), docData);

      form.reset();
      const porcInput = qs("porciones");
      if (porcInput) porcInput.value = "0";
      const selEl = qs("categorySelect");
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
  const filterSelect = qs("filterCategory");

  attachSearch(recipesContainer, searchInput);
  attachCategoryFilter(recipesContainer, filterSelect);

  await loadCategoriesForFilter();
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
