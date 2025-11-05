import { db } from "./firebase.js";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========= Helpers =========
const qs = (id) => document.getElementById(id);
const el = (tag, cls = "") => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// ========= Referencias =========
const addBtn = qs("addCollectionBtn");      // botón flotante ＋
const lista = qs("coleccionesLista");       // <ul>
const msg = qs("msgColecciones");           // mensajes (feedback)

// Modal crear/editar
const dlg = qs("dlgCol");
const form = qs("formCol");
const dlgTitulo = qs("dlgTitulo");
const inpNombre = qs("colNombre");
const inpDesc = qs("colDesc");
const btnCancelar = qs("btnCancelar");

// Modal eliminar
const dlgDel = qs("dlgDel");
const formDel = qs("formDel");
const delName = qs("delName");
const btnCancelDel = qs("btnCancelDel");

let editId = null;           // null = nueva; id = editar existente
let pendingDelete = null;    // { id, nombre } cuando abres el modal de borrar

// ========= Modal crear/editar =========
addBtn?.addEventListener("click", () => abrirModal());
btnCancelar?.addEventListener("click", () => dlg.close());

function abrirModal(data = null) {
  if (data) {
    dlgTitulo.textContent = "Editar colección";
    inpNombre.value = data.nombre || "";
    inpDesc.value = data.descripcion || "";
    editId = data.__id || null;
  } else {
    dlgTitulo.textContent = "Nueva colección";
    inpNombre.value = "";
    inpDesc.value = "";
    editId = null;
  }
  dlg.showModal();
  setTimeout(() => inpNombre.focus(), 50);
}

// Guardar (crear/editar)
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = inpNombre.value.trim();
  const descripcion = inpDesc.value.trim();
  if (!nombre) return;

  try {
    if (editId) {
      await updateDoc(doc(collection(db, "colecciones"), editId), { nombre, descripcion });
      flash("Colección actualizada ✅");
    } else {
      await addDoc(collection(db, "colecciones"), {
        nombre,
        descripcion,
        recetas: [],                 // luego guardaremos aquí IDs de recetas
        createdAt: serverTimestamp(),
      });
      flash("Colección creada ✅");
    }
    dlg.close();
    listarColecciones();
  } catch (err) {
    console.error(err);
    flash("Error al guardar la colección", true);
  }
});

function flash(texto, isError = false) {
  msg.textContent = texto;
  msg.style.color = isError ? "var(--danger, #c0392b)" : "inherit";
  if (!isError) setTimeout(() => (msg.textContent = ""), 2000);
}

// ========= Listado =========
async function safeQueryColecciones() {
  const col = collection(db, "colecciones");
  try {
    return await getDocs(query(col, orderBy("createdAt", "desc")));
  } catch {
    return await getDocs(col); // fallback si algunos docs no tienen createdAt
  }
}

async function listarColecciones() {
  lista.innerHTML = "Cargando…";
  try {
    const snap = await safeQueryColecciones();
    const items = snap.docs.map(d => ({ __id: d.id, ...d.data() }));

    lista.innerHTML = "";
    if (!items.length) {
      const li = el("li", "collection-empty");
      li.textContent = "Aún no hay colecciones.";
      lista.appendChild(li);
      return;
    }

    items.forEach(data => lista.appendChild(renderItem(data)));
  } catch (e) {
    console.error(e);
    lista.innerHTML = "Error al cargar colecciones";
  }
}

// ======= Tarjeta estilo “categoría”: todo el bloque es link =======
function renderItem(data) {
  const li = el("li", "collection-item");

  // Zona principal clickable (link grande)
  const main = el("a", "collection-main");
  main.href = `colecciones-detalle.html?id=${data.__id}`;
  main.setAttribute("aria-label", `Abrir colección ${data.nombre || ""}`);

  const title = el("h3", "collection-title");
  title.textContent = data.nombre || "(sin nombre)";

  const desc = el("p", "collection-desc");
  desc.textContent = data.descripcion || "";

  main.append(title);
  if (data.descripcion) main.append(desc);

  // Acciones a la derecha (no deben navegar)
  const actions = el("div", "collection-actions");

  const btnEdit = el("button", "btn-warning btn-sm");
  btnEdit.innerHTML = "✏️&nbsp;Editar";
  btnEdit.addEventListener("click", (ev) => {
    ev.preventDefault();   // evita que el <a> navegue
    ev.stopPropagation();
    abrirModal(data);
  });

  const btnDel = el("button", "btn-danger btn-sm");
  btnDel.innerHTML = "🗑&nbsp;Borrar";
  btnDel.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    abrirModalEliminar(data.__id, data.nombre || "(sin nombre)");
  });

  actions.append(btnEdit, btnDel);

  // Estructura final
  li.append(main, actions);
  return li;
}

// ========= Modal eliminar =========
function abrirModalEliminar(id, nombre) {
  pendingDelete = { id, nombre };
  delName.textContent = nombre;
  dlgDel.showModal();
}

// cancelar eliminar
btnCancelDel?.addEventListener("click", () => {
  pendingDelete = null;
  dlgDel.close();
});

// confirmar eliminar
formDel?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingDelete) { dlgDel.close(); return; }
  const { id } = pendingDelete;
  try {
    await deleteDoc(doc(collection(db, "colecciones"), id));
    flash("Colección eliminada 🗑️");
  } catch (err) {
    console.error(err);
    flash("No se pudo borrar", true);
  } finally {
    pendingDelete = null;
    dlgDel.close();
    listarColecciones();
  }
});

// ========= Inicializar =========
listarColecciones();
