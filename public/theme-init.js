// Aplica o tema escuro antes do Angular carregar (sem "piscar" claro). Arquivo próprio, e não um
// <script> dentro do index.html, porque a Content-Security-Policy só deixa rodar scripts do próprio site.
(function () {
  try {
    var t = localStorage.getItem('mintly-theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (_) {
    /* sem storage: fica no claro */
  }
})();
