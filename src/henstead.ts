// Entry point: load the KayKit models first, then start the farm.
import { loadKit } from './kit';

const btn = document.getElementById('ovBtn') as HTMLButtonElement;
btn.disabled = true;
btn.textContent = 'Loading the farm';
loadKit('models/', f => { btn.textContent = `Loading the farm ${Math.round(f * 100)}%`; })
  .then(() => import('./farm'))
  .catch(err => {
    console.error(err);
    btn.textContent = 'The farm could not load';
    const p = document.createElement('p');
    p.textContent = 'Some game files did not download. Check your connection and reload the page.';
    btn.parentElement!.before(p);
  });
