import { db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, orderBy, where, documentId
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== Helpers =====
const qs = (id) => document.getElementById(id);
const el = (tag, cls="") => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const getParam = (name) => new URL(location.href).searchParams.get(name);
const chunk = (arr, size) => { const out=[]; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };

// ===== Refs =====
const titulo = qs("tituloColeccion");
const grid = qs("gridRecetas");
const msg = qs("detalleMsg");
const emptyState = qs("emptyState");

const assignBtn = qs("assignBtn");
const dlg = qs("dlgAsignar");
const formAsignar = qs("formAsignar");
const listaChecks = qs("listaRecetasCheckbox");
const buscarInput = qs("buscarReceta");
const btnCerrarDlg = qs("btnCerrarDlg");

let colId = null;
let coleccion = null;            // { id, data }
let cacheRecetas = [];           // [{id, data}]
let seleccionActual = new Set(); // ids ya asignados

// ===== Cargar detalle =====
async function cargar() {
  colId = getParam("id");
  if (!colId) { if (msg) msg.textContent = "Falta parámetro id"; return; }

  const snap = await getDoc(doc(db, "colecciones", colId));
  if (!snap.exists()) { if (msg) msg.textContent = "Colección no encontrada"; return; }

  coleccion = { id: colId, data: snap.data() };
  titulo.textContent = coleccion.data.nombre || "Colección";

  const dlgTitle = qs("dlgTitulo");
  if (dlgTitle) dlgTitle.textContent = `Seleccionar recetas para: ${coleccion.data.nombre || "Colección"}`;

  seleccionActual = new Set(Array.isArray(coleccion.data.recetas) ? coleccion.data.recetas : []);

  await renderRecetasAsignadas();
}

async function renderRecetasAsignadas() {
  grid.innerHTML = "";

  const ids = Array.from(seleccionActual);
  if (!ids.length) {
    // mostrar empty state cuando no hay recetas asignadas
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  // Firestore IN admite máx 10 ids por query
  const grupos = chunk(ids, 10);
  const recetas = [];
  for (const g of grupos) {
    const q = query(collection(db, "recetas"), where(documentId(), "in", g));
    const s = await getDocs(q);
    s.docs.forEach(d => recetas.push({ id: d.id, data: d.data() }));
  }
  pintarCards(recetas);
}

// ===== Pintar tarjetas como en el index =====
function pintarCards(items) {
  grid.innerHTML = "";
  items.forEach(({id, data}) => {
    const card = el("article", "recipe-card");

    if (data.imagen) {
      const img = el("img", "recipe-img");
      img.src = data.imagen;
      img.alt = data.nombre || "";
      img.loading = "lazy";
      card.appendChild(img);
    }

    const info = el("div", "recipe-info");

    const h3 = el("h3");
    h3.textContent = data.nombre || "Sin título";

    const meta = el("div", "meta");
    const tiempo = data.tiempo || "—";
    const porciones = Number.isFinite(data.porciones) ? data.porciones : (data.raciones ?? 0);
    const categoria = (data.categoria || data.collectionName || "").trim();

    meta.innerHTML = `
      <span class="badge">⏱️ ${tiempo}</span>
      ${porciones > 0 ? `<span class="badge">🍰 ${porciones} porciones</span>` : ""}
      ${categoria ? `<span class="badge">📚 ${categoria}</span>` : ""}
    `;

    info.append(h3, meta);
    card.append(info);

    // click tarjeta -> detalle receta dentro de colección
    card.addEventListener("click", () => {
      window.location.href = `receta-detalle-coleccion.html?id=${id}&col=${coleccion.id}`;
    });

    grid.appendChild(card);
  });
}

// ===== Modal: abrir, buscar, pintar lista con checkboxes =====
assignBtn?.addEventListener("click", abrirModalAsignar);
btnCerrarDlg?.addEventListener("click", () => dlg.close());
formAsignar?.addEventListener("submit", guardarAsignacion);
buscarInput?.addEventListener("input", filtrarLista);

async function abrirModalAsignar() {
  if (!cacheRecetas.length) {
    try {
      const snap = await getDocs(query(collection(db, "recetas"), orderBy("createdAt", "desc")));
      cacheRecetas = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    } catch {
      const snap = await getDocs(collection(db, "recetas"));
      cacheRecetas = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    }
  }

  pintarLista(cacheRecetas, seleccionActual);
  buscarInput.value = "";
  dlg.showModal();
}

function filtrarLista() {
  const q = (buscarInput.value || "").trim().toLowerCase();
  const filtradas = cacheRecetas.filter(r => (r.data.nombre || "").toLowerCase().includes(q));
  pintarLista(filtradas, seleccionActual);
}

function pintarLista(recetas, seleccionSet) {
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='80'>
       <rect width='100%' height='100%' fill='#1b1b1b'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
             fill='#777' font-family='sans-serif' font-size='12'>Sin imagen</text>
     </svg>`
  );

  listaChecks.innerHTML = "";
  if (!recetas.length) {
    const li = el("li", "list-item");
    li.textContent = "No hay recetas.";
    listaChecks.appendChild(li);
    return;
  }

  recetas.forEach(({ id, data }) => {
    const li = el("li", "select-item");
    const checked = seleccionSet.has(id);
    if (checked) li.classList.add("is-checked");

    // checkbox
    const chk = el("input", "select-check");
    chk.type = "checkbox";
    chk.value = id;
    chk.checked = checked;

    // contenido (thumbnail + textos)
    const content = el("div", "select-content");

    const img = el("img", "select-thumb");
    img.src = data.imagen || PLACEHOLDER;
    img.alt = data.nombre || "Sin título";

    const textWrap = el("div");

    const title = el("div", "select-title");
    title.textContent = data.nombre || "Sin título";

    const meta = el("div", "select-meta");
    const tiempo = data.tiempo || "—";
    const porciones = Number.isFinite(data.porciones) ? data.porciones : (data.raciones ?? 0);
    const categoria = (data.categoria || data.collectionName || "").trim();

    // badges
    const b1 = el("span", "select-badge"); b1.textContent = `⏱️ ${tiempo}`;
    meta.appendChild(b1);
    if (porciones > 0) {
      const b2 = el("span", "select-badge"); b2.textContent = `🍰 ${porciones} porciones`;
      meta.appendChild(b2);
    }
    if (categoria) {
      const b3 = el("span", "select-badge"); b3.textContent = `📚 ${categoria}`;
      meta.appendChild(b3);
    }

    textWrap.append(title, meta);
    content.append(img, textWrap);

    // click en tarjeta alterna selección (excepto si viene del checkbox)
    li.addEventListener("click", (ev) => {
      if ((ev.target instanceof HTMLInputElement) && ev.target.type === "checkbox") return;
      chk.checked = !chk.checked;
      li.classList.toggle("is-checked", chk.checked);
    });

    // reflejar estilo al cambiar el input
    chk.addEventListener("change", () => {
      li.classList.toggle("is-checked", chk.checked);
    });

    // montaje final
    li.prepend(chk);
    li.appendChild(content);
    listaChecks.appendChild(li);
  });
}

// ===== Guardar asignación =====
async function guardarAsignacion(ev) {
  ev.preventDefault();
  const marcados = Array.from(listaChecks.querySelectorAll('input[type="checkbox"]:checked'))
                        .map(x => x.value);

  try {
    await updateDoc(doc(db, "colecciones", coleccion.id), { recetas: marcados });
    seleccionActual = new Set(marcados);
    dlg.close();
    await renderRecetasAsignadas();
  } catch (e) {
    console.error(e);
    alert("No se pudo guardar la asignación");
  }
}

// ===== init =====
cargar();
