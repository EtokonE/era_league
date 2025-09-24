(function () {
  const tabsContainer = document.querySelector('[data-division-tabs]');
  const panelContainer = document.querySelector('[data-division-panel]');
  const updatedAtNode = document.querySelector('[data-updated-at]');
  const lightbox = document.querySelector('[data-lightbox]');
  const lightboxImage = lightbox ? lightbox.querySelector('[data-lightbox-image]') : null;
  const lightboxClosers = lightbox ? lightbox.querySelectorAll('[data-lightbox-close]') : [];

  if (!panelContainer || !tabsContainer) {
    return;
  }

  const state = {
    data: null,
    activeDivisionId: null,
    activeGroup: {}
  };

  let lastLightboxTrigger = null;

  const formatRating = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    return value.toFixed(2).replace('.', ',');
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const createEl = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.className) {
      node.className = options.className;
    }
    if (options.textContent) {
      node.textContent = options.textContent;
    }
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          node.setAttribute(key, value);
        }
      });
    }
    return node;
  };

  const createIcon = (id, className = 'icon') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `images/icons.svg#${id}`);
    svg.appendChild(use);
    return svg;
  };

  const ensureActiveDivision = () => {
    if (!state.data || !Array.isArray(state.data.divisions) || !state.data.divisions.length) {
      state.activeDivisionId = null;
      return;
    }

    if (!state.activeDivisionId || !state.data.divisions.some((division) => division.id === state.activeDivisionId)) {
      state.activeDivisionId = state.data.divisions[0].id;
    }

    state.data.divisions.forEach((division) => {
      if (!state.activeGroup[division.id]) {
        const initialGroup = division.defaultGroup || (Array.isArray(division.groups) && division.groups.length ? division.groups[0].id : 'all');
        state.activeGroup[division.id] = initialGroup;
      }
    });
  };

  const handleDivisionTabKeydown = (event) => {
    const { key } = event;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
      return;
    }
    const tabs = Array.from(tabsContainer.querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(event.currentTarget);
    if (index === -1) {
      return;
    }
    event.preventDefault();
    const nextIndex = key === 'ArrowRight'
      ? (index + 1) % tabs.length
      : (index - 1 + tabs.length) % tabs.length;
    const target = tabs[nextIndex];
    target.focus();
    target.click();
  };

  const handleGroupTabKeydown = (event, tablist) => {
    const { key } = event;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
      return;
    }
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(event.currentTarget);
    if (index === -1) {
      return;
    }
    event.preventDefault();
    const nextIndex = key === 'ArrowRight'
      ? (index + 1) % tabs.length
      : (index - 1 + tabs.length) % tabs.length;
    const target = tabs[nextIndex];
    target.focus();
    target.click();
  };

  const setActiveDivision = (divisionId) => {
    if (state.activeDivisionId === divisionId) {
      return;
    }
    state.activeDivisionId = divisionId;
    renderDivisionTabs();
    renderActiveDivisionPanel();
  };

  const setActiveGroup = (divisionId, groupId) => {
    if (state.activeGroup[divisionId] === groupId) {
      return;
    }
    state.activeGroup[divisionId] = groupId;
    renderActiveDivisionPanel();
  };

  const createPill = (text, variant = 'neutral') => {
    const className = variant && variant !== 'neutral'
      ? `pill pill--${variant}`
      : 'pill';
    return createEl('span', { className, textContent: text });
  };

  const computeAverageRating = (players) => {
    const ratings = players
      .map((player) => (player && typeof player.rating === 'number' ? player.rating : null))
      .filter((value) => typeof value === 'number');
    if (!ratings.length) {
      return null;
    }
    if (ratings.length === 1) {
      return ratings[0];
    }
    const sum = ratings.reduce((total, current) => total + current, 0);
    return sum / ratings.length;
  };

  const assignGroupTier = (entry, division) => {
    if (!entry || entry.type === 'cta') {
      return entry;
    }
    if (!division || !Array.isArray(division.groups) || !division.groups.length) {
      return entry;
    }

    const thresholds = division.groupThresholds;
    if (!thresholds || typeof thresholds.gold !== 'number') {
      return entry;
    }

    const players = Array.isArray(entry.players) ? entry.players : [];
    const average = computeAverageRating(players);
    if (average === null) {
      return entry;
    }

    const goldThreshold = thresholds.gold;
    const nextTier = average > goldThreshold ? 'gold' : 'silver';

    if (entry.tier === nextTier) {
      return entry;
    }

    return { ...entry, tier: nextTier };
  };

  const buildGroupList = (division) => {
    if (!division || !Array.isArray(division.groups) || !division.groups.length) {
      return [];
    }
    const groups = division.groups.map((group) => ({ ...group }));
    const hasAll = groups.some((group) => group.id === 'all');
    if (!hasAll) {
      groups.unshift({ id: 'all', label: 'Все' });
    } else {
      groups.sort((a, b) => {
        if (a.id === 'all') return -1;
        if (b.id === 'all') return 1;
        return 0;
      });
    }
    return groups;
  };

  const matchesGroup = (entry, groupId, hasGroups) => {
    if (!hasGroups || !groupId || groupId === 'all') {
      return true;
    }
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    if (!('tier' in entry) || entry.tier === 'all') {
      return true;
    }
    return entry.tier === groupId;
  };

  const splitEntries = (division) => {
    const entries = Array.isArray(division.entries) ? division.entries.slice() : [];
    const hasGroups = Array.isArray(division.groups) && division.groups.length > 0;
    const activeGroup = state.activeGroup[division.id];

    const assignedEntries = hasGroups
      ? entries.map((entry) => assignGroupTier(entry, division))
      : entries;

    const filtered = assignedEntries.filter((entry) => matchesGroup(entry, activeGroup, hasGroups));
    const teams = [];
    const ctas = [];

    filtered.forEach((entry) => {
      if (entry && entry.type === 'cta') {
        ctas.push(entry);
      } else {
        teams.push(entry);
      }
    });

    return { teams, ctas };
  };

  const renderDivisionTabs = () => {
    tabsContainer.innerHTML = '';
    if (!state.data || !Array.isArray(state.data.divisions)) {
      return;
    }

    state.data.divisions.forEach((division, index) => {
      const button = createEl('button', {
        className: 'tabs__button',
        textContent: division.title || `Дивизион ${index + 1}`,
        attrs: {
          type: 'button',
          role: 'tab',
          id: `division-tab-${division.id}`,
          'aria-controls': `division-panel-${division.id}`,
          'aria-selected': division.id === state.activeDivisionId ? 'true' : 'false',
          tabindex: division.id === state.activeDivisionId ? '0' : '-1'
        }
      });

      button.addEventListener('click', () => setActiveDivision(division.id));
      button.addEventListener('keydown', handleDivisionTabKeydown);
      tabsContainer.appendChild(button);
    });
  };

  const renderPlayerTile = (player, index) => {
    const tile = createEl('div', { className: 'player-tile' });
    const media = createEl('div', { className: 'player-tile__media' });

    const badge = createPill(`Игрок ${index + 1}`, 'neutral');
    badge.classList.add('player-tile__badge');
    media.appendChild(badge);

    if (player && player.photo) {
      const photoButton = createEl('button', {
        className: 'player-tile__photo',
        attrs: {
          type: 'button',
          'data-lightbox-trigger': 'true',
          'data-lightbox-src': player.photo,
          'data-lightbox-alt': player.name || 'Фото игрока'
        }
      });
      const img = createEl('img');
      img.src = player.photo;
      img.alt = player.name || 'Фото игрока';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 480;
      img.height = 360;
      photoButton.appendChild(img);
      media.appendChild(photoButton);
    } else {
      const placeholder = createEl('div', { className: 'player-tile__placeholder' });
      placeholder.appendChild(createIcon('icon-user'));
      placeholder.appendChild(createEl('span', { textContent: 'Фото не загружено' }));
      media.appendChild(placeholder);
    }

    const body = createEl('div', { className: 'player-tile__body' });
    const name = createEl('div', { className: 'player-tile__name', textContent: player && player.name ? player.name : '—' });
    const ratingText = `Рейтинг: ${formatRating(player && player.rating)}`;
    const rating = createEl('div', { className: 'player-tile__meta', textContent: ratingText });

    body.appendChild(name);
    body.appendChild(rating);

    tile.appendChild(media);
    tile.appendChild(body);

    return tile;
  };

  const renderEmptyTile = (index) => {
    const tile = createEl('div', { className: 'player-tile player-tile--empty' });
    const media = createEl('div', { className: 'player-tile__media' });

    const badge = createPill(`Игрок ${index + 1}`, 'neutral');
    badge.classList.add('player-tile__badge');
    media.appendChild(badge);

    const placeholder = createEl('div', { className: 'player-tile__placeholder' });
    placeholder.appendChild(createIcon('icon-user'));
    placeholder.appendChild(createEl('span', { textContent: 'Свободно' }));
    media.appendChild(placeholder);

    const body = createEl('div', { className: 'player-tile__body' });
    body.appendChild(createEl('div', { className: 'player-tile__name', textContent: '—' }));
    body.appendChild(createEl('div', { className: 'player-tile__meta', textContent: 'Рейтинг: —' }));

    tile.appendChild(media);
    tile.appendChild(body);

    return tile;
  };

  const formatTeamTitle = (entry, players) => {
    const names = players.map((player) => player && player.name).filter(Boolean);
    if (names.length === 2) {
      return `${names[0]} — ${names[1]}`;
    }
    if (names.length === 1) {
      return `${names[0]} — свободно`;
    }
    if (entry && entry.type === 'solo') {
      return 'Одиночная заявка';
    }
    return 'Заявка без имени';
  };

  const renderStatusFooter = (entry, players) => {
    const footer = createEl('div', { className: 'team-card__footer' });
    const statusList = createEl('div', { className: 'status-list' });
    const statuses = Array.isArray(entry.statuses) ? entry.statuses.filter(Boolean) : [];
    const missingPhotosHint = players.length && players.every((player) => !player.photo)
      ? 'Чтобы добавить фото, напишите @Etokone.'
      : null;

    if (missingPhotosHint && !statuses.includes(missingPhotosHint)) {
      statuses.push(missingPhotosHint);
    }

    if (!statuses.length) {
      return null;
    }

    const primary = createEl('span', { className: 'status-list__item', textContent: statuses[0] });
    statusList.appendChild(primary);

    if (statuses.length > 1) {
      const extra = createEl('div', { className: 'status-list__extra', attrs: { 'aria-hidden': 'true' } });
      statuses.slice(1).forEach((status) => {
        extra.appendChild(createEl('div', { className: 'status-list__extra-item', textContent: status }));
      });
      statusList.appendChild(extra);

      const toggle = createEl('button', {
        className: 'status-toggle',
        textContent: 'Ещё',
        attrs: { type: 'button', 'aria-expanded': 'false' }
      });
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        extra.setAttribute('aria-hidden', expanded ? 'true' : 'false');
        toggle.textContent = expanded ? 'Ещё' : 'Скрыть';
      });

      footer.appendChild(statusList);
      footer.appendChild(toggle);
      return footer;
    }

    footer.appendChild(statusList);
    return footer;
  };

  const renderTeamCard = (entry) => {
    const players = Array.isArray(entry.players) ? entry.players.slice(0, 2) : [];
    const card = createEl('article', { className: 'team-card' });
    card.dataset.state = entry.type === 'solo' ? 'semi' : 'full';

    const header = createEl('div', { className: 'team-card__header' });
    const title = createEl('h3', { className: 'team-card__title', textContent: formatTeamTitle(entry, players) });
    header.appendChild(title);

    const badgeList = createEl('div', { className: 'team-card__badges' });
    const average = computeAverageRating(players);
    if (average !== null) {
      badgeList.appendChild(createPill(`СР. РЕЙТИНГ ${formatRating(average)}`, 'rating'));
    }
    if (entry.type === 'solo') {
      badgeList.appendChild(createPill('Одиночная заявка', 'solo'));
    }
    if (entry.note) {
      const variant = entry.noteType === 'looking' ? 'looking' : entry.noteType === 'solo' ? 'solo' : 'neutral';
      if (!(entry.type === 'solo' && variant === 'solo')) {
        badgeList.appendChild(createPill(entry.note, variant));
      }
    }

    if (badgeList.childNodes.length) {
      header.appendChild(badgeList);
    }

    const body = createEl('div', { className: 'team-card__body' });
    players.forEach((player, index) => {
      body.appendChild(renderPlayerTile(player, index));
    });

    if (entry.type === 'solo' || players.length === 1) {
      body.appendChild(renderEmptyTile(players.length + 1));
    }

    if (players.length === 0) {
      body.appendChild(renderEmptyTile(1));
      body.appendChild(renderEmptyTile(2));
    }

    card.appendChild(header);
    card.appendChild(body);
    const footer = renderStatusFooter(entry, players);
    if (footer) {
      card.appendChild(footer);
    }

    return card;
  };

  const renderCtaCard = (entry) => {
    const card = createEl('article', { className: 'team-card team-card--cta' });
    const header = createEl('div', { className: 'team-card__header' });
    const title = createEl('h3', { className: 'team-card__title', textContent: entry.title || 'Присоединиться к сезону' });
    header.appendChild(title);

    const body = createEl('div', { className: 'team-card__body team-card__body--cta' });
    if (entry.description) {
      body.appendChild(createEl('p', { className: 'team-card__description', textContent: entry.description }));
    }

    if (entry.action && entry.action.href) {
      const actions = createEl('div', { className: 'team-card__actions' });
      const actionButton = createEl('a', {
        className: 'button button--primary',
        textContent: entry.action.label || 'Подать заявку',
        attrs: {
          href: entry.action.href,
          target: '_blank',
          rel: 'noopener'
        }
      });
      actions.appendChild(actionButton);
      body.appendChild(actions);
    }

    card.appendChild(header);
    card.appendChild(body);

    return card;
  };

  const renderActiveDivisionPanel = () => {
    panelContainer.innerHTML = '';
    if (!state.activeDivisionId || !state.data) {
      return;
    }

    const division = state.data.divisions.find((item) => item.id === state.activeDivisionId);
    if (!division) {
      panelContainer.appendChild(createEl('p', { className: 'card-section__hint', textContent: 'Не удалось найти выбранный дивизион.' }));
      return;
    }

    const section = createEl('section', {
      className: 'card-section',
      attrs: {
        role: 'tabpanel',
        id: `division-panel-${division.id}`,
        'aria-labelledby': `division-tab-${division.id}`
      }
    });

    const head = createEl('header', { className: 'card-section__head' });
    head.appendChild(createEl('h2', { className: 'card-section__title', textContent: division.title || 'Дивизион' }));
    if (division.subtitle) {
      head.appendChild(createEl('p', { className: 'card-section__hint', textContent: division.subtitle }));
    }

    const groups = buildGroupList(division);
    if (groups.length) {
      const tabsWrap = createEl('div', { className: 'card-section__tabs' });
      const tablist = createEl('div', { className: 'tabs tabs--sub', attrs: { role: 'tablist' } });
      const activeGroup = state.activeGroup[division.id];

      groups.forEach((group) => {
        const button = createEl('button', {
          className: `tabs__button tabs__button--group-${group.id}`,
          textContent: group.label,
          attrs: {
            type: 'button',
            role: 'tab',
            id: `division-${division.id}-group-${group.id}`,
            'aria-controls': `division-panel-${division.id}`,
            'aria-selected': activeGroup === group.id ? 'true' : 'false',
            tabindex: activeGroup === group.id ? '0' : '-1'
          }
        });
        button.addEventListener('click', () => setActiveGroup(division.id, group.id));
        button.addEventListener('keydown', (event) => handleGroupTabKeydown(event, tablist));
        tablist.appendChild(button);
      });

      tabsWrap.appendChild(tablist);
      head.appendChild(tabsWrap);
    }

    section.appendChild(head);

    const { teams, ctas } = splitEntries(division);
    if (!teams.length && !ctas.length) {
      section.appendChild(createEl('p', {
        className: 'card-section__hint',
        textContent: 'Заявок пока нет. Нажмите «Подать заявку», чтобы попасть в список.'
      }));
      panelContainer.appendChild(section);
      return;
    }

    const grid = createEl('div', { className: 'team-grid' });
    teams.forEach((entry) => {
      grid.appendChild(renderTeamCard(entry));
    });
    ctas.forEach((entry) => {
      grid.appendChild(renderCtaCard(entry));
    });

    section.appendChild(grid);
    panelContainer.appendChild(section);
  };

  const renderData = (data) => {
    state.data = data;
    ensureActiveDivision();
    renderDivisionTabs();
    renderActiveDivisionPanel();

    if (updatedAtNode) {
      updatedAtNode.textContent = formatDate(data.updatedAt);
    }
  };

  const renderError = (message) => {
    panelContainer.innerHTML = '';
    panelContainer.appendChild(createEl('p', {
      className: 'card-section__hint',
      textContent: message || 'Не удалось загрузить список команд. Попробуйте обновить страницу.'
    }));
  };

  const openLightbox = (src, alt, trigger) => {
    if (!lightbox || !lightboxImage || !src) {
      return;
    }
    lastLightboxTrigger = trigger || null;
    lightboxImage.src = src;
    lightboxImage.alt = alt || 'Фото игрока';
    lightbox.hidden = false;
    requestAnimationFrame(() => {
      lightbox.classList.add('is-open');
    });
    document.addEventListener('keydown', handleEscapeClose);
  };

  const closeLightbox = () => {
    if (!lightbox || !lightboxImage) {
      return;
    }
    lightbox.classList.remove('is-open');
    lightbox.hidden = true;
    lightboxImage.src = '';
    if (lastLightboxTrigger && typeof lastLightboxTrigger.focus === 'function') {
      lastLightboxTrigger.focus();
    }
    lastLightboxTrigger = null;
    document.removeEventListener('keydown', handleEscapeClose);
  };

  const handleEscapeClose = (event) => {
    if (event.key === 'Escape') {
      closeLightbox();
    }
  };

  if (lightbox) {
    lightboxClosers.forEach((button) => {
      button.addEventListener('click', closeLightbox);
    });
  }

  panelContainer.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-lightbox-trigger]');
    if (!trigger) {
      return;
    }
    event.preventDefault();
    openLightbox(trigger.getAttribute('data-lightbox-src'), trigger.getAttribute('data-lightbox-alt'), trigger);
  });

  if (lightbox) {
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox || event.target.hasAttribute('data-lightbox-close')) {
        closeLightbox();
      }
    });
  }

  fetch('data/divisions.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(renderData)
    .catch((error) => {
      console.error('[era-league] Ошибка загрузки данных', error);
      renderError('Не удалось загрузить данные. Свяжитесь с администратором.');
    });
})();
