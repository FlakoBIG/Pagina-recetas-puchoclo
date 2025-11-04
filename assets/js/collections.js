import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const els = {
  list: document.getElementById("collectionsList"),
  empty: document.getElementById("emptyState"),

  openAddBtn: document.getElementById("openAddCollectionBtn"),
  addDialog: document.getElementById("collectionDialog"),
  addForm: document.getElementById("collectionForm"),
  addInput: document.getElementById("colName"),
  addCancel: document.getElementById("cancelCollectionBtn"),

  editDialog: document.getElementById("editCollectionDialog"),
  editForm: document.getElementById("editCollectionForm"),
  editInput: document.getElementById("editColName"),
  editCancel: document.getElementById("cancelEditBtn"),

  confirmDialog: document.getElementById("confirmDialog"),
  confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
  cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
};

let editingId = null;
let pendingDeleteId = null;

const showModal = (d) => (typeof d.showModal === "function" ? d.showModal() : d.setAttribute("open","open"));
const closeModal = (d) => (typeof d.close === "function" ? d.close() : d.removeAttribute("open"));

function refreshEmptyState() {
  const hasItems = !!els.list.querySelector("[data-id]");
  els.empty.style.display = hasItems ? "none" : "block";
}

/* --- FILA estilo “nombre izq + botones der” --- */
function row({ id, name }) {
  const item = document.createElement("div");
  item.className = "col-row";
  item.dataset.id = id;

  const title = document.createElement("h3");
  title.className = "col-title";
  title.textContent = name || "";

  const actions = document.createElement("div");
  actions.className = "col-actions";

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
    editingId = id;
    els.editInput.value = name || "";
    showModal(els.editDialog);
    setTimeout(() => els.editInput.focus(), 0);
  });

  // Borrar
  btnDel.addEventListener("click", () => {
    pendingDeleteId = id;
    showModal(els.confirmDialog);
  });

  return item;
}

/* --- Cargar --- */
async function loadCollections() {
  els.list.innerHTML = "";
  try {
    const snap = await getDocs(query(collection(db,"colecciones"), orderBy("name","asc")));
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

/* --- Agregar --- */
async function addCollection(ev) {
  ev?.preventDefault?.();
  const name = (els.addInput.value || "").trim();
  if (!name) { els.addInput.focus(); return; }
  try {
    const docRef = await addDoc(collection(db,"colecciones"), { name });
    els.list.prepend(row({ id: docRef.id, name }));
    closeModal(els.addDialog);
    els.addInput.value = "";
    refreshEmptyState();
  } catch (e) { console.error(e); }
}

/* --- Editar --- */
async function saveEdit(ev) {
  ev?.preventDefault?.();
  const newName = (els.editInput.value || "").trim();
  if (!newName || !editingId) { els.editInput.focus(); return; }
  try {
    await updateDoc(doc(db,"colecciones",editingId), { name: newName });
    const r = els.list.querySelector(`[data-id="${editingId}"]`);
    r?.querySelector(".col-title")?.replaceChildren(document.createTextNode(newName));
    closeModal(els.editDialog);
    editingId = null;
  } catch (e) { console.error(e); }
}

/* --- Borrar --- */
async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    await deleteDoc(doc(db,"colecciones",pendingDeleteId));
    els.list.querySelector(`[data-id="${pendingDeleteId}"]`)?.remove();
  } catch (e) { console.error(e); }
  finally {
    closeModal(els.confirmDialog);
    pendingDeleteId = null;
    refreshEmptyState();
  }
}

/* --- Eventos --- */
els.openAddBtn?.addEventListener("click", () => {
  els.addInput.value = "";
  showModal(els.addDialog);
  setTimeout(() => els.addInput.focus(), 0);
});
els.addCancel?.addEventListener("click", () => closeModal(els.addDialog));
els.addForm?.addEventListener("submit", addCollection);

els.editCancel?.addEventListener("click", () => {
  editingId = null;
  closeModal(els.editDialog);
});
els.editForm?.addEventListener("submit", saveEdit);

els.cancelDeleteBtn?.addEventListener("click", () => {
  pendingDeleteId = null;
  closeModal(els.confirmDialog);
});
els.confirmDeleteBtn?.addEventListener("click", confirmDelete);

/* --- Init --- */
loadCollections();
