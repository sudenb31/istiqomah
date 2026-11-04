// Pembuat elemen kecil. Teks pengguna selalu masuk lewat text node, tidak pernah lewat innerHTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  append(el, kids);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) el.style.setProperty(prop, val);
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') {
      el[k] = v;
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, v);
    }
  }
  return el;
}

function append(el, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

export const srOnly = (text) => h('span', { class: 'sr' }, text);
