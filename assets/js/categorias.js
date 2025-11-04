import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, where, limit, startAfter, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   Elementos
========================================================= */
const els = {
  list: document.getElementById("categoriesList"),
  empty: document.getElementById("emptyState"),

  openAddBtn: document.getElementById("openAddCategoryBtn"),
  addDialog: document.getElementById("categoryDialog"),
  addForm: document.getElementById("categoryForm"),
  addInput: document.getElementById("catName"),
  addCancel: document.getElementById("cancelCategoryBtn"),

  editDialog: document.getElementById("editCategoryDialog"),
  editForm: document.getElementById("editCategoryForm"),
  editInput: document.getElementById("editCatName"),
  editCancel: document.getElementById("cancelEditBtn"),

  confirmDialog: document.getElementById("confirmDialog"),
  confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
  cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
};

let editing = { id: null, oldName: null };
let pendingDelete = { id: null, name: null };

const showModal  = (d) => (typeof d.showModal === "function" ? d.showModal() : d.setAttribute("open","open"));
const closeModal = (d) => (typeof d.close === "function" ? d.close() : d.removeAttribute("open"));

function refreshEmptyState() {
  const hasItems = !!els.list.querySelector("[data-id]");
  els.empty.style.display = hasItems ? "none" : "block";
}

/* =========================================================
   UI: fila categoría
========================================================= */
function row({ id, name }) {
  const item = document.createElement("div");
  item.className = "cat-row";
  item.dataset.id = id;
  item.dataset.name = name;

  const title = document.createElement("h3");
  title.className = "cat-title";
  title.textContent = name || "";

  const actions = document.createElement("div");
  actions.className = "cat-actions";

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn-primary";
  btnEdit.type = "button";
  btnEdit.textContent = "✏️ Editar";

  const btnDel = document.createElement("button");
  btnDel.className = "btn-danger";
  btnDel.type = "button";
  btnDel.textContent = "🗑️ Borrar";

  actions.append(btnEdit, btnDel);
  item.append(title, actions);

  // Editar
  btnEdit.addEventListener("click", () => {
    editing.id = id;
    editing.oldName = name || "";
    els.editInput.value = name || "";
    showModal(els.editDialog);
    setTimeout(() => els.editInput.focus(), 0);
  });

  // Borrar
  btnDel.addEventListener("click", () => {
    pendingDelete.id = id;
    pendingDelete.name = name || "";
    showModal(els.confirmDialog);
  });

  return item;
}

/* =========================================================
   Cargar
========================================================= */
async function loadCategories() {
  els.list.innerHTML = "";
  try {
    const snap = await getDocs(query(collection(db,"categorias"), orderBy("name","asc")));
    if (snap.empty) { refreshEmptyState(); return; }
    const frag = document.createDocumentFragment();
    snap.forEach(d => {
      const { name } = d.data();
      frag.appendChild(row({ id: d.id, name }));
    });
    els.list.appendChild(frag);
    refreshEmptyState();
  } catch (e) {
    console.error(e);
    refreshEmptyState();
  }
}

/* =========================================================
   Helpers de cascada sobre RECETAS
   - Soporta:
     A) recetas con { categoria: string }
     B) recetas con { categorias: string[] }
========================================================= */
const RECIPES_COL = "recetas";
const CHUNK = 400; // deja margen bajo límite de 500 escrituras por batch

/** Recorre en páginas y aplica un callback a cada doc de recetas que coincida con el query */
async function foreachRecipeWhere(qBase, onDoc) {
  let cursor = null;
  while (true) {
    const qPage = cursor
      ? query(qBase, startAfter(cursor), limit(CHUNK))
      : query(qBase, limit(CHUNK));
    const snap = await getDocs(qPage);
    if (snap.empty) break;

    let last = null;
    for (const d of snap.docs) {
      await onDoc(d);
      last = d;
    }
    if (!last) break;
    cursor = last;
  }
}

/** Renombra una categoría en todas las recetas */
async function cascadeRenameCategory(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;

  // 1) categoria == oldName (string)
  const qStr = query(collection(db, RECIPES_COL), where("categoria", "==", oldName));
  await foreachRecipeWhere(qStr, async (d) => {
    try {
      await updateDoc(d.ref, { categoria: newName });
    } catch (e) { console.error("rename (string) ->", d.id, e); }
  });

  // 2) categorias array contiene oldName
  const qArr = query(collection(db, RECIPES_COL), where("categorias", "array-contains", oldName));
  await foreachRecipeWhere(qArr, async (d) => {
    try {
      const data = d.data() || {};
      const arr = Array.isArray(data.categorias) ? data.categorias : [];
      const updated = [...new Set(arr.map(x => (x === oldName ? newName : x)))];
      await updateDoc(d.ref, { categorias: updated });
    } catch (e) { console.error("rename (array) ->", d.id, e); }
  });
}

/** Quita una categoría de todas las recetas */
async function cascadeDeleteCategory(nameToRemove) {
  if (!nameToRemove) return;

  // 1) categoria == nameToRemove -> eliminar propiedad
  const qStr = query(collection(db, RECIPES_COL), where("categoria", "==", nameToRemove));
  await foreachRecipeWhere(qStr, async (d) => {
    try {
      // quitar campo 'categoria' dejando receta sin categoría
      await updateDoc(d.ref, { categoria: null });
    } catch (e) { console.error("delete (string) ->", d.id, e); }
  });

  // 2) categorias array contiene nameToRemove -> filtrar
  const qArr = query(collection(db, RECIPES_COL), where("categorias", "array-contains", nameToRemove));
  await foreachRecipeWhere(qArr, async (d) => {
    try {
      const data = d.data() || {};
      const arr = Array.isArray(data.categorias) ? data.categorias : [];
      const updated = arr.filter(x => x !== nameToRemove);
      await updateDoc(d.ref, { categorias: updated });
    } catch (e) { console.error("delete (array) ->", d.id, e); }
  });
}

/* =========================================================
   Agregar
========================================================= */
async function addCategory(ev) {
  ev?.preventDefault?.();
  const name = (els.addInput.value || "").trim();
  if (!name) { els.addInput.focus(); return; }
  try {
    const docRef = await addDoc(collection(db,"categorias"), { name });
    els.list.prepend(row({ id: docRef.id, name }));
    closeModal(els.addDialog);
    els.addInput.value = "";
    refreshEmptyState();
  } catch (e) { console.error(e); }
}

/* =========================================================
   Editar (con cascada)
========================================================= */
async function saveEdit(ev) {
  ev?.preventDefault?.();
  const newName = (els.editInput.value || "").trim();
  const id = editing.id;
  const oldName = (editing.oldName || "").trim();
  if (!newName || !id) { els.editInput.focus(); return; }

  try {
    // 1) actualizar categoría en su doc
    await updateDoc(doc(db,"categorias",id), { name: newName });

    // 2) cascada en recetas
    await cascadeRenameCategory(oldName, newName);

    // 3) refrescar UI
    const r = els.list.querySelector(`[data-id="${id}"]`);
    if (r) {
      r.dataset.name = newName;
      r.querySelector(".cat-title")?.replaceChildren(document.createTextNode(newName));
    }
    closeModal(els.editDialog);
  } catch (e) {
    console.error(e);
  } finally {
    editing = { id: null, oldName: null };
  }
}

/* =========================================================
   Borrar (con cascada)
========================================================= */
async function confirmDelete() {
  const id = pendingDelete.id;
  const name = (pendingDelete.name || "").trim();
  if (!id) return;
  try {
    // 1) borrar doc de categoría
    await deleteDoc(doc(db,"categorias",id));

    // 2) cascada en recetas: quitar la categoría
    await cascadeDeleteCategory(name);

    // 3) UI
    els.list.querySelector(`[data-id="${id}"]`)?.remove();
  } catch (e) {
    console.error(e);
  } finally {
    closeModal(els.confirmDialog);
    pendingDelete = { id: null, name: null };
    refreshEmptyState();
  }
}

/* =========================================================
   Eventos
========================================================= */
els.openAddBtn?.addEventListener("click", () => {
  els.addInput.value = "";
  showModal(els.addDialog);
  setTimeout(() => els.addInput.focus(), 0);
});
els.addCancel?.addEventListener("click", () => closeModal(els.addDialog));
els.addForm?.addEventListener("submit", addCategory);

els.editCancel?.addEventListener("click", () => {
  editing = { id: null, oldName: null };
  closeModal(els.editDialog);
});
els.editForm?.addEventListener("submit", saveEdit);

els.cancelDeleteBtn?.addEventListener("click", () => {
  pendingDelete = { id: null, name: null };
  closeModal(els.confirmDialog);
});
els.confirmDeleteBtn?.addEventListener("click", confirmDelete);

/* =========================================================
   Init
========================================================= */
loadCategories();
