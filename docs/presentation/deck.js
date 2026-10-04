'use strict';
const slides = [...document.querySelectorAll('.slide')];
const counter = document.getElementById('counter');
let i = Math.max(0, Math.min(slides.length - 1, Number(new URLSearchParams(location.search).get('s')) - 1 || 0));

function show(n) {
  i = (n + slides.length) % slides.length;
  slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
  counter.textContent = `${i + 1} / ${slides.length}`;
  history.replaceState(null, '', `?s=${i + 1}`);
}

document.getElementById('prev').addEventListener('click', () => show(i - 1));
document.getElementById('next').addEventListener('click', () => show(i + 1));
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(i + 1); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
  if (e.key === 'Home') show(0);
  if (e.key === 'End') show(slides.length - 1);
  if (e.key.toLowerCase() === 'p') window.print();
});
document.querySelector('.deck').addEventListener('click', (e) => {
  if (e.target.closest('a,button,.hud')) return;
  const x = e.clientX / window.innerWidth;
  show(x > 0.35 ? i + 1 : i - 1);
});

show(i);

// Pełny eksport PDF: wszystkie slajdy widoczne pod @media print
if (new URLSearchParams(location.search).has('print')) {
  document.documentElement.classList.add('print-all');
  slides.forEach((s) => s.classList.add('active'));
}
