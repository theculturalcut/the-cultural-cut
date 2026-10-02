// script.js
// Monta o cabeçalho e o rodapé em todas as páginas públicas
// e controla o menu do celular. Edite os links e as imagens aqui, em um lugar só.

(function () {
    'use strict';
  
    // ---------- Configuração ----------
    const SITE_NAME = 'The Cultural Cut';
    const SITE_TAGLINE = 'Cobertura editorial independente de música, cinema, série e cultura pop.';
  
    // IMAGENS: troque o nome do arquivo aqui se o seu for diferente (.svg ou .png)
    // Logo da barra do topo (versão escura, para fundo branco)
    const LOGO_SRC = 'assets/logo/logo-black.svg';
    // Logo do rodapé (versão branca, para fundo preto). Se o arquivo não existir,
    // o site usa a logo da barra, pintada de branco automaticamente.
    const FOOTER_LOGO_SRC = 'assets/logo/the-cultural-cut-branca.svg';
  
    // Links do menu do topo, na ordem em que aparecem
    const NAV_LINKS = [
      { href: 'musica.html', label: 'Música' },
      { href: 'cinema.html', label: 'Cinema' },
      { href: 'series.html', label: 'Séries' },
      { href: 'variedades.html', label: 'Variedades' },
      { href: 'reviews.html', label: 'Reviews' },
    ];
  
    // Rodapé: coluna "Seções"
    const FOOTER_SECTIONS = [
      { href: 'musica.html', label: 'Música' },
      { href: 'cinema.html', label: 'Cinema' },
      { href: 'series.html', label: 'Séries' },
      { href: 'variedades.html', label: 'Variedades' },
      { href: 'reviews.html', label: 'Reviews' },
    ];
  
    // Rodapé: coluna "Sobre"
    const FOOTER_ABOUT = [
      { href: 'quem-somos.html', label: 'Quem somos' },
      { href: 'contato.html', label: 'Contato' },
      { href: 'publicidade.html', label: 'Publicidade' },
    ];
  
    // Rodapé: coluna "Siga-nos". Os endereços vêm das Configurações do painel;
    // as redes que ficarem em branco lá não aparecem aqui.
    const SOCIAL_LINKS = [
      { key: 'social_instagram', label: 'Instagram' },
      { key: 'social_x', label: 'Twitter' },
      { key: 'social_tiktok', label: 'TikTok' },
      { key: 'social_youtube', label: 'YouTube' },
    ];
  
    // Páginas individuais destacam o link da lista correspondente
    const ACTIVE_ALIAS = {
      'artigo.html': 'artigos.html',
      'review.html': 'reviews.html',
    };
  
    const ICON_MENU =
      '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M2 5h16M2 10h16M2 15h16"/></svg>';
    const ICON_CLOSE =
      '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M4 4l12 12M16 4L4 16"/></svg>';
  
    // ---------- Funções auxiliares ----------
    function currentPage() {
      let page = window.location.pathname.split('/').pop();
      if (!page) return 'index.html';
      if (!page.includes('.')) page += '.html'; // GitHub Pages aceita /artigos sem .html
      return page;
    }
  
    function toElement(html) {
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      return template.content.firstElementChild;
    }
  
    function navLinksHtml(activePage) {
      return NAV_LINKS.map(function (link) {
        const current = link.href === activePage ? ' aria-current="page"' : '';
        return '<a href="' + link.href + '"' + current + '>' + link.label + '</a>';
      }).join('');
    }
  
    function searchForm(className, inputId) {
      return (
        '<form class="' + className + '" action="busca.html" method="get" role="search">' +
        '<label class="visually-hidden" for="' + inputId + '">Buscar no site</label>' +
        '<input id="' + inputId + '" type="search" name="q" placeholder="Buscar" autocomplete="off">' +
        '</form>'
      );
    }
  
    // ---------- Cabeçalho ----------
    function buildHeader() {
      const placeholder = document.getElementById('site-header');
      if (!placeholder) return;
  
      const active = ACTIVE_ALIAS[currentPage()] || currentPage();
  
      const header = toElement(
        '<header class="site-header">' +
          '<div class="container site-header__inner">' +
            '<a class="logo" href="index.html">' +
              '<img src="' + LOGO_SRC + '" alt="' + SITE_NAME + '">' +
            '</a>' +
            '<nav class="nav" id="menu-principal" aria-label="Principal">' +
              searchForm('nav__search', 'busca-menu') +
              navLinksHtml(active) +
            '</nav>' +
            '<div class="header-actions">' +
              searchForm('search-box', 'busca-topo') +
              '<button class="nav-toggle" type="button" aria-expanded="false" ' +
                'aria-controls="menu-principal" aria-label="Abrir menu">' + ICON_MENU + '</button>' +
            '</div>' +
          '</div>' +
        '</header>'
      );
  
      // Troca o espaço reservado pelo cabeçalho (necessário para o "sticky" funcionar)
      placeholder.replaceWith(header);
  
      // Preenche a busca com o termo da URL (?q=...), sem usar innerHTML
      const term = new URLSearchParams(window.location.search).get('q');
      if (term) {
        header.querySelectorAll('input[type="search"]').forEach(function (input) {
          input.value = term;
        });
      }
  
      setupMenu(header);
    }
  
    // ---------- Menu do celular ----------
    function setupMenu(header) {
      const nav = header.querySelector('.nav');
      const toggle = header.querySelector('.nav-toggle');
  
      function setOpen(open) {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        toggle.innerHTML = open ? ICON_CLOSE : ICON_MENU;
      }
  
      toggle.addEventListener('click', function () {
        setOpen(!nav.classList.contains('is-open'));
      });
  
      // Fecha ao clicar em um link do menu
      nav.addEventListener('click', function (event) {
        if (event.target.closest('a')) setOpen(false);
      });
  
      // Fecha com a tecla Esc e devolve o foco ao botão
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && nav.classList.contains('is-open')) {
          setOpen(false);
          toggle.focus();
        }
      });
  
      // Fecha ao clicar fora do cabeçalho
      document.addEventListener('click', function (event) {
        if (nav.classList.contains('is-open') && !header.contains(event.target)) {
          setOpen(false);
        }
      });
  
      // Fecha se a janela ficar larga (menu vira horizontal)
      window.matchMedia('(min-width: 861px)').addEventListener('change', function (event) {
        if (event.matches) setOpen(false);
      });
    }
  
    // ---------- Rodapé ----------
    function listHtml(links) {
      return links.map(function (link) {
        return '<li><a href="' + link.href + '">' + link.label + '</a></li>';
      }).join('');
    }
  
    // Se a logo branca não existir, usa a da barra (pintada de branco). Se nenhuma existir, mostra o nome.
    function setupFooterLogo(image) {
      image.addEventListener('error', function () {
        if (!image.dataset.fallback) {
          image.dataset.fallback = '1';
          image.classList.add('footer__logo--invert');
          image.src = LOGO_SRC;
          return;
        }
        const text = document.createElement('span');
        text.className = 'footer__brand-text';
        text.textContent = SITE_NAME;
        image.replaceWith(text);
      });
    }
  
    function buildFooter() {
      const placeholder = document.getElementById('site-footer');
      if (!placeholder) return;
  
      const year = new Date().getFullYear();
  
      const footer = toElement(
        '<footer class="site-footer">' +
          '<div class="container">' +
            '<div class="footer__inner">' +
              '<div class="footer__brand">' +
                '<a class="footer__logo-link" href="index.html" aria-label="' + SITE_NAME + ', página inicial">' +
                  '<img class="footer__logo" id="rodape-logo" src="' + FOOTER_LOGO_SRC + '" alt="' + SITE_NAME + '">' +
                '</a>' +
                '<p class="footer__text" id="rodape-descricao">' + SITE_TAGLINE + '</p>' +
              '</div>' +
              '<div>' +
                '<p class="footer__heading">Seções</p>' +
                '<ul class="footer__list">' + listHtml(FOOTER_SECTIONS) + '</ul>' +
              '</div>' +
              '<div>' +
                '<p class="footer__heading">Sobre</p>' +
                '<ul class="footer__list">' + listHtml(FOOTER_ABOUT) + '</ul>' +
              '</div>' +
              '<div id="rodape-redes-coluna" hidden>' +
                '<p class="footer__heading">Siga-nos</p>' +
                '<ul class="footer__list" id="rodape-redes"></ul>' +
              '</div>' +
            '</div>' +
            '<div class="footer__legal">' +
              '<span>© ' + year + ' ' + SITE_NAME + '. Todos os direitos reservados.</span>' +
              '<a href="login.html">Área da Redação</a>' +
            '</div>' +
          '</div>' +
        '</footer>'
      );
  
      placeholder.replaceWith(footer);
      setupFooterLogo(footer.querySelector('#rodape-logo'));
      loadSettings();
    }
  
    // ---------- Configurações do painel (descrição e redes sociais) ----------
    // Tudo é montado com textContent e com endereços validados, nunca com HTML solto.
    function applySettings(settings) {
      const description = String(settings.site_description || '').trim();
      const descriptionEl = document.getElementById('rodape-descricao');
      if (descriptionEl && description) descriptionEl.textContent = description;
  
      const list = document.getElementById('rodape-redes');
      const column = document.getElementById('rodape-redes-coluna');
      if (!list || !column) return;
  
      SOCIAL_LINKS.forEach(function (social) {
        const url = String(settings[social.key] || '').trim();
        if (!/^https:\/\//i.test(url)) return; // só links https
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = social.label;
        item.appendChild(link);
        list.appendChild(item);
      });
  
      // A coluna "Siga-nos" só aparece se houver pelo menos uma rede cadastrada
      column.hidden = list.children.length === 0;
    }
  
    async function loadSettings() {
      try {
        const module = await import('./js/supabase.js');
        const result = await module.supabase.from('settings').select('key, value');
        if (result.error || !result.data) return;
  
        const settings = {};
        result.data.forEach(function (row) { settings[row.key] = row.value; });
        applySettings(settings);
      } catch (error) {
        // Se não der para carregar, o rodapé continua com os textos padrão
      }
    }
  
    // ---------- Link "Pular para o conteúdo" (acessibilidade) ----------
    function buildSkipLink() {
      if (!document.getElementById('conteudo')) return;
      const link = toElement('<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>');
      document.body.prepend(link);
    }
  
    // ---------- Início ----------
    buildSkipLink();
    buildHeader();
    buildFooter();
  })();