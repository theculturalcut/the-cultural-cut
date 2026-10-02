// admin/js/falha.js
// Plano B: se o painel não carregar, mostra o motivo em vez de uma tela em branco.
// Carregue como script comum (sem type="module") ANTES do script da página.
(function () {
    function showFailure(detail) {
      if (!document.body.classList.contains('is-checking')) return;
      document.body.classList.remove('is-checking');
      var box = document.createElement('main');
      box.style.cssText = 'max-width:40rem;margin:3rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;line-height:1.6';
      box.innerHTML =
        '<h1 style="font-size:1.5rem">Não foi possível carregar o painel</h1>' +
        '<p>Algum arquivo não foi encontrado ou tem erro. Aperte F12 e abra a aba Console para ver os detalhes.</p>' +
        '<pre id="falha-detalhe" style="white-space:pre-wrap;background:#f2f2f2;padding:1rem"></pre>';
      document.body.innerHTML = '';
      document.body.appendChild(box);
      document.getElementById('falha-detalhe').textContent = detail || '';
    }
  
    window.addEventListener('error', function (e) { showFailure(e.message); });
    window.addEventListener('unhandledrejection', function (e) {
      showFailure(String((e.reason && e.reason.message) || e.reason));
    });
    document.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'SCRIPT') showFailure('Não foi possível carregar: ' + e.target.src);
    }, true);
    setTimeout(function () {
      showFailure('O painel demorou demais para responder (mais de 10 segundos).');
    }, 10000);
  })();