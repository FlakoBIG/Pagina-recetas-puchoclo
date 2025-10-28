import { db } from "./firebase.js";
import { doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const getParam = (k) => new URL(window.location.href).searchParams.get(k);

// Quita numeración/bullets al convertir a array (para guardar limpio)
function linesToArr(txt) {
  return (txt || "")
    .split(/\r?\n/)
    .map(s => s.replace(/^\s*(\d+\)\s*|[-•]\s*)/, "").trim()) // quita "1) " o "• " o "-"
    .filter(Boolean);
}

// Convierte array/texto a líneas con VIÑETA "• "
function toBulletedLines(src) {
  const lines = Array.isArray(src) ? src : (src || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return "• ";
  return lines.map(s => `• ${s}`).join("\n");
}

// Convierte array/texto a líneas NUMERADAS "1) "
function toNumberedLines(src) {
  const lines = Array.isArray(src) ? src : (src || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return "1) ";
  return lines.map((s, i) => `${i + 1}) ${s}`).join("\n");
}

/* ---------- DOM ---------- */
const msg = $("detalleMsg");
const card = $("detalleCard");
const editBtn = $("editBtn");
const deleteBtn = $("deleteBtn");

const editDialog = $("editDialog");
const editForm = $("editForm");
const cancelEditBtn = $("cancelEditBtn");

const confirmDialog = $("confirmDialog");
const cancelDeleteBtn = $("cancelDeleteBtn");
const confirmDeleteBtn = $("confirmDeleteBtn");

const e_titulo = $("e_titulo");
const e_tiempo = $("e_tiempo");
const e_porciones = $("e_porciones");
const e_imagenUrl = $("e_imagenUrl");
const e_ingredientes = $("e_ingredientes");
const e_pasos = $("e_pasos");

/* ---------- Estado ---------- */
const id = getParam("id");
let currentData = null;

/* ---------- Auto-formato en edición ---------- */
// Ingredientes: añade "• " en cada Enter
function enableAutoBullets(el) {
  if (!el) return;
  if (!el.value.trim()) el.value = "• ";
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.value += "\n• ";
      // mueve cursor al final
      setTimeout(() => { el.selectionStart = el.selectionEnd = el.value.length; }, 0);
    }
  });
}

// Pasos: añade "n) " consecutivo en cada Enter
function enableAutoNumbering(el) {
  if (!el) return;
  if (!el.value.trim()) el.value = "1) ";
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // contar líneas reales (no vacías)
      const count = el.value.split(/\r?\n/).filter(l => l.trim().length).length;
      el.value += `\n${count + 1}) `;
      setTimeout(() => { el.selectionStart = el.selectionEnd = el.value.length; }, 0);
    }
  });
}

/* ---------- Cargar receta ---------- */
async function loadRecipe() {
  if (!id) {
    msg.textContent = "❌ Falta el id en la URL.";
    return;
  }
  try {
    msg.textContent = "⏳ Cargando…";
    const ref = doc(db, "recetas", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      msg.textContent = "❌ La receta no existe o fue eliminada.";
      return;
    }
    currentData = snap.data();
    msg.textContent = "";

    const porc = (currentData.porciones ?? currentData.raciones ?? 0);

    // Pintar detalle
    card.innerHTML = `
      <img src="${currentData.imagen || ""}" alt="${currentData.nombre || ""}" />
      <div class="detalle-body">
        <h2>${currentData.nombre || "Sin título"}</h2>
        <p class="meta">
          <span class="badge">⏱️ ${currentData.tiempo || "—"}</span>
          ${porc > 0 ? `<span class="badge">🍰 ${porc} porciones</span>` : ""}
        </p>

        <h3>🧺 Ingredientes</h3>
        <ul class="listita">
          ${(currentData.ingredientes || []).map(x => `<li>${x}</li>`).join("") || "<li>—</li>"}
        </ul>

        <h3>👩‍🍳 Preparación</h3>
        <ol class="listita">
          ${(currentData.pasos || []).map(x => `<li>${x}</li>`).join("") || "<li>—</li>"}
        </ol>
      </div>
    `;

    // Prellenar modal edición con formato visible:
    e_titulo.value     = currentData.nombre || "";
    e_tiempo.value     = /^\d{2}:\d{2}$/.test(currentData.tiempo || "") ? currentData.tiempo : "00:30";
    e_porciones.value  = porc; // 0 si no existe
    e_imagenUrl.value  = currentData.imagen || "";
    e_ingredientes.value = toBulletedLines(currentData.ingredientes); // • item
    e_pasos.value        = toNumberedLines(currentData.pasos);        // 1) item

  } catch (err) {
    console.error(err);
    msg.textContent = "⚠️ Error al cargar la receta.";
  }
}

/* ---------- Abrir/Cerrar modales ---------- */
function ensureDialogPolyfill(dlg) {
  if (!dlg) return;
  if (typeof dlg.showModal !== "function") {
    dlg.showModal = () => dlg.classList.remove("hidden");
    dlg.close = () => dlg.classList.add("hidden");
    dlg.classList.add("hidden");
  }
}
function setupDialogs() {
  ensureDialogPolyfill(editDialog);
  ensureDialogPolyfill(confirmDialog);

  editBtn.addEventListener("click", () => {
    // Asegurar auto-formato activo cada vez que abres
    enableAutoBullets(e_ingredientes);
    enableAutoNumbering(e_pasos);
    // Si por alguna razón vienen vacíos, semilla:
    if (!e_ingredientes.value.trim()) e_ingredientes.value = "• ";
    if (!e_pasos.value.trim()) e_pasos.value = "1) ";
    editDialog.showModal();
  });
  cancelEditBtn.addEventListener("click", () => editDialog.close());

  deleteBtn.addEventListener("click", () => confirmDialog.showModal());
  cancelDeleteBtn.addEventListener("click", () => confirmDialog.close());
}

/* ---------- Guardar edición ---------- */
function normalizeTime(value) {
  return /^\d{2}:\d{2}$/.test(value) ? value : "00:30";
}

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Guardando cambios…";

  const porcVal = Math.max(0, parseInt(e_porciones.value, 10) || 0);

  const updated = {
    nombre: e_titulo.value.trim(),
    tiempo: normalizeTime(e_tiempo.value.trim()),
    porciones: porcVal, // ← guarda porciones (0 permitido)
    imagen: e_imagenUrl.value.trim(),
    // Se limpia la numeración/viñetas para guardar como arrays “puros”
    ingredientes: linesToArr(e_ingredientes.value),
    pasos: linesToArr(e_pasos.value),
  };

  try {
    await updateDoc(doc(db, "recetas", id), updated);
    msg.textContent = "Cambios guardados ✔";
    editDialog.close();
    await loadRecipe();
  } catch (err) {
    console.error(err);
    msg.textContent = "⚠️ Error al actualizar.";
  }
});

/* ---------- Confirmar borrado ---------- */
confirmDeleteBtn.addEventListener("click", async () => {
  try {
    await deleteDoc(doc(db, "recetas", id));
    confirmDialog.close();
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    msg.textContent = "⚠️ Error al borrar.";
    confirmDialog.close();
  }
});

/* ---------- Init ---------- */
window.addEventListener("DOMContentLoaded", () => {
  setupDialogs();
  loadRecipe();
});
