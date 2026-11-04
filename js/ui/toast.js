import { h } from './dom.js';

let timer = null;

export function toast(message, action, duration) {
  const el = document.getElementById('toast');
  clearTimeout(timer);
  el.replaceChildren(h('span', null, message));
  if (action) {
    el.append(
      h('button', {
        type: 'button',
        class: 'toast-action',
        onClick: () => {
          el.hidden = true;
          action.run();
        },
      }, action.label),
    );
  }
  el.hidden = false;
  timer = setTimeout(() => { el.hidden = true; }, duration ?? (action ? 7000 : 3500));
}
