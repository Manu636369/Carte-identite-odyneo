(() => {
  'use strict';

  // Les noms ci-dessous doivent correspondre aux onglets importés dans Grist.
  const TABLES = ['Association', 'Etablissements', 'Implantations', 'Unites'];
  const FIELDS = {
    Association: ["Nom de l'association", "Logo de l'association", 'Couleur principale (HEX)', 'Couleur secondaire (HEX)', "Couleur d'accent (HEX)", 'Police (facultative)', 'Référence de la charte', 'Date de vérification'],
    Etablissements: ["Nom de l'établissement", 'Public de l’établissement', 'Adresse administrative', 'E-mail administratif', 'Téléphone administratif', "Logo ou photo de l’établissement"],
    Implantations: ['Établissement de rattachement', 'Nom du lieu', 'Adresse complète', 'Étage(s)', 'Photo du lieu'],
    Unites: ["Nom de l'unité / du service", 'Établissement de rattachement', 'Type de service', 'Précision du type (si autre)', 'Public accueilli par l’unité', 'Précisions sur le public', 'Lieu', 'Étage / bâtiment', "Modalités d'accueil", 'Orientations / notifications (foyers uniquement)', "Photo ou logo de l'unité"]
  };

  const SERVICE_TYPES = [
    'Service d’accueil de jour (SAJ)', 'SAJ médicalisé (SAJM / SAJ M)',
    'Foyer de vie (FV)', 'Foyer d’hébergement (FH)',
    'Établissement d’accueil médicalisé (EAM / AEM, ex-FAM)',
    'Maison d’accueil spécialisée (MAS)', 'Établissement et service d’aide par le travail (ESAT)',
    'CAMSP', 'EAJE / crèche', 'IMP', 'IME', 'CEM', 'SESSAD', 'SAVS',
    'SAVS renforcé', 'SAVS à domicile', 'Service social', 'Autre / à préciser'
  ];
  const ESTABLISHMENT_PUBLICS = ['Petite enfance', 'Enfants / adolescents', 'Adultes'];
  const UNIT_PUBLICS = [
    {label:'Personnes avec un handicap moteur ou neuromoteur', description:'Difficultés de mouvement et de posture ; les capacités intellectuelles peuvent être préservées.'},
    {label:'Personnes présentant une paralysie cérébrale', description:'Troubles moteurs liés à une atteinte cérébrale précoce, avec ou sans troubles associés.'},
    {label:'Personnes polyhandicapées', description:'Déficiences motrices et intellectuelles sévères et besoins d’accompagnement importants.'},
    {label:'Personnes cérébrolésées', description:'Séquelles d’un traumatisme crânien, d’un AVC ou d’une tumeur cérébrale.'},
    {label:'Personnes présentant une maladie neurologique évolutive', description:'Notamment la sclérose en plaques.'},
    {label:'Autre public / à préciser', description:''}
  ];
  const MODALITIES = [
    'Accueil permanent', 'Accueil temporaire', 'Accueil de répit', 'Accueil de jour',
    'Internat de semaine', 'Internat séquentiel', 'Semi-internat',
    'Hébergement externalisé', 'Logement ou stage', 'Habitat groupé',
    'Accompagnement à domicile', 'Vacances / répit', 'Intervention multisite', 'Autre / à préciser'
  ];
  const FOYER_OPTIONS = [
    'Orientation foyer de vie (FV)', 'Orientation foyer d’hébergement (FH)',
    'Orientation EAM / AEM (ex-FAM)', 'Orientation MAS', 'Autre / à préciser'
  ];

  const $ = id => document.getElementById(id);
  const state = {
    data: {}, columns: {}, tableIds: {}, page: 'home', establishmentId: null,
    formType: null, editingId: null, search: '', saving: false,
    autoSaveTimer: null, autoSaveQueued: false
  };
  const normalise = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const rows = table => state.data[table] || [];
  const column = (table, label) => state.columns[table]?.[normalise(label)] || null;

  function unbox(value) {
    if (!Array.isArray(value)) return value;
    if (value[0] === 'R') return Number(value.length > 2 ? value[2] : value[1]) || null;
    if (value[0] === 'L') return value.slice(1);
    if (value[0] === 'E') return '';
    return value;
  }
  function getValue(table, row, label) {
    const id = column(table, label);
    return id && row ? unbox(row[id]) : null;
  }
  function findRow(table, id) { return rows(table).find(row => Number(row.id) === Number(id)) || null; }
  function relationId(table, row, label) { return Number(getValue(table, row, label)) || null; }
  function attachmentId(table, row, label) {
    const value = unbox(getValue(table, row, label));
    if (Array.isArray(value)) return Number(value.flat(Infinity).find(Number)) || null;
    return Number(value) || null;
  }
  function recordName(table, row) {
    const field = {
      Association: "Nom de l'association",
      Etablissements: "Nom de l'établissement",
      Implantations: 'Nom du lieu',
      Unites: "Nom de l'unité / du service"
    }[table];
    return String(getValue(table, row, field) || 'Fiche sans nom');
  }
  function status(text, kind = 'info') {
    const element = $('message');
    element.textContent = text || '';
    element.className = text ? 'message ' + kind : 'message hidden';
  }
  function connection(text, isOnline = true) {
    $('connection').textContent = text;
    $('connection').classList.toggle('offline', !isOnline);
  }

  async function loadColumns() {
    const [tableMeta, columnMeta] = await Promise.all([
      grist.docApi.fetchTable('_grist_Tables'),
      grist.docApi.fetchTable('_grist_Tables_column')
    ]);
    const tableRefs = {};
    (tableMeta.tableId || []).forEach((tableId, index) => { tableRefs[tableId] = Number(tableMeta.id?.[index]); });
    state.columns = {};
    for (const table of TABLES) {
      const tableRef = tableRefs[state.tableIds[table] || table];
      state.columns[table] = {};
      if (!tableRef) continue;
      (columnMeta.colId || []).forEach((columnId, index) => {
        if (Number(unbox(columnMeta.parentId?.[index])) === tableRef) {
          const label = columnMeta.label?.[index];
          if (label) state.columns[table][normalise(label)] = columnId;
        }
      });
    }
  }

  async function loadData() {
    connection('Lecture des fiches…');
    const available = await grist.docApi.listTables();
    state.tableIds = {};
    const normaliseTableId = value => String(value || '').toLowerCase().replace(/\d+$/, '');
    for (const table of TABLES) {
      if (available.includes(table)) {
        state.tableIds[table] = table;
        continue;
      }
      // Grist peut ajouter un chiffre à l’identifiant technique d’une table
      // réimportée, même si son nom visible reste « Association », par exemple.
      const candidates = available.filter(id => normaliseTableId(id) === normaliseTableId(table));
      if (candidates.length === 1) state.tableIds[table] = candidates[0];
    }
    const missing = TABLES.filter(table => !state.tableIds[table]);
    if (missing.length) {
      const found = available.length ? available.join(', ') : 'aucune';
      throw new Error('Version SANS PÔLE : le widget attend les tables ' + TABLES.join(', ') + '. Table(s) manquante(s) : ' + missing.join(', ') + '. Tables détectées dans Grist : ' + found + '.');
    }
    await loadColumns();
    for (const table of TABLES) {
      const raw = await grist.docApi.fetchTable(state.tableIds[table]);
      const keys = Object.keys(raw).filter(key => key !== 'id');
      state.data[table] = (raw.id || []).map((id, index) => {
        const row = {id};
        for (const key of keys) row[key] = raw[key]?.[index];
        return row;
      });
    }
    for (const table of TABLES) {
      for (const label of FIELDS[table]) {
        if (!column(table, label)) throw new Error('Colonne absente : « ' + label + ' » dans la table « ' + table + ' ». Vérifie les intitulés du classeur.');
      }
    }
    await applyCharter();
    connection('Connecté à Grist · sans pôle');
  }

  function validHex(value) { return /^#[\da-f]{6}$/i.test(String(value || '').trim()); }
  async function applyCharter() {
    const row = rows('Association')[0];
    const colors = [
      ['Couleur principale (HEX)', '--primary', '#173D64'],
      ['Couleur secondaire (HEX)', '--secondary', '#DE8436'],
      ["Couleur d'accent (HEX)", '--accent', '#A9C442']
    ];
    for (const [label, cssName, fallback] of colors) {
      const value = getValue('Association', row, label);
      document.documentElement.style.setProperty(cssName, validHex(value) ? String(value).trim() : fallback);
    }
    const font = String(getValue('Association', row, 'Police (facultative)') || '').trim();
    const allowedFonts = ['Arial', 'Helvetica', 'Aptos', 'Verdana', 'Tahoma'];
    document.documentElement.style.setProperty('--font-family', allowedFonts.includes(font) ? font + ', sans-serif' : 'Arial, Helvetica, sans-serif');
    const logo = $('brand');
    const id = attachmentId('Association', row, "Logo de l'association");
    logo.textContent = 'O';
    if (id) {
      const url = await attachmentUrl(id);
      if (url) logo.innerHTML = '<img src="' + escapeHtml(url) + '" alt="Logo Odynéo">';
    }
  }

  async function attachmentUrl(id) {
    try {
      const token = await grist.docApi.getAccessToken({readOnly: true});
      return token.baseUrl + '/attachments/' + Number(id) + '/download?auth=' + encodeURIComponent(token.token);
    } catch (_) { return null; }
  }
  async function loadImages(root = document) {
    for (const image of root.querySelectorAll('img[data-attachment]')) {
      const url = await attachmentUrl(image.dataset.attachment);
      if (url) image.src = url;
    }
  }
  async function uploadImage(file) {
    if (!file) return null;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choisis une image PNG, JPG ou WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('L’image doit peser 5 Mo maximum.');
    const token = await grist.docApi.getAccessToken({readOnly: false});
    const body = new FormData();
    body.append('upload', file, file.name);
    const response = await fetch(token.baseUrl + '/attachments?auth=' + encodeURIComponent(token.token), {
      method: 'POST',
      headers: {'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'},
      body
    });
    if (!response.ok) throw new Error('Grist n’a pas pu enregistrer l’image (erreur ' + response.status + ').');
    const result = await response.json();
    const id = Array.isArray(result) ? result[0] : (result.id ?? result.attachmentId ?? result);
    if (!Number(id)) throw new Error('Grist n’a pas confirmé le téléversement de l’image.');
    return Number(id);
  }

  function mapPayload(table, values) {
    const result = {};
    for (const [label, value] of Object.entries(values)) {
      const id = column(table, label);
      if (id) result[id] = value;
    }
    return result;
  }
  async function createRecord(table, values) {
    const result = await grist.getTable(state.tableIds[table] || table).create(mapPayload(table, values));
    const first = Array.isArray(result) ? result[0] : result;
    const id = Number(first?.id ?? first);
    if (!id) throw new Error('Grist n’a pas confirmé la création dans la table « ' + table + ' ».');
    return id;
  }
  async function updateRecord(table, id, values) {
    await grist.getTable(state.tableIds[table] || table).update({id: Number(id), ...mapPayload(table, values)});
  }
  async function deleteRecord(table, id) { await grist.getTable(state.tableIds[table] || table).destroy(Number(id)); }

  function field(id, label, value = '', options = {}) {
    const required = options.required ? ' required' : '';
    const wide = options.wide ? ' wide' : '';
    const help = options.help ? '<small class="field-help">' + escapeHtml(options.help) + '</small>' : '';
    const marker = options.required ? ' <span class="required">*</span>' : '';
    const input = options.textarea
      ? '<textarea id="' + id + '"' + required + ' placeholder="' + escapeHtml(options.placeholder || '') + '">' + escapeHtml(value) + '</textarea>'
      : '<input id="' + id + '" type="' + (options.type || 'text') + '" value="' + escapeHtml(value) + '"' + required + ' placeholder="' + escapeHtml(options.placeholder || '') + '">';
    return '<div class="field' + wide + '"><label for="' + id + '">' + escapeHtml(label) + marker + '</label>' + input + help + '</div>';
  }
  function choiceOptions(options, selected) {
    return options.map(value => '<option value="' + escapeHtml(value) + '" ' + (value === selected ? 'selected' : '') + '>' + escapeHtml(value) + '</option>').join('');
  }
  function selectField(id, label, options, selected = '', required = false, help = '') {
    return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + (required ? ' <span class="required">*</span>' : '') + '</label><select id="' + id + '"' + (required ? ' required' : '') + '><option value="">Choisir…</option>' + choiceOptions(options, selected) + '</select>' + (help ? '<small class="field-help">' + escapeHtml(help) + '</small>' : '') + '</div>';
  }
  function multiField(id, label, options, selected = [], help = '') {
    const selectedValues = new Set(Array.isArray(selected) ? selected : []);
    const html = options.map(option => {
      const item = typeof option === 'string' ? {label: option, description: ''} : option;
      return '<label class="check-option"><input type="checkbox" name="' + id + '" value="' + escapeHtml(item.label) + '" ' + (selectedValues.has(item.label) ? 'checked' : '') + '><span><strong>' + escapeHtml(item.label) + '</strong>' + (item.description ? '<small>' + escapeHtml(item.description) + '</small>' : '') + '</span></label>';
    }).join('');
    return '<div class="field wide"><label>' + escapeHtml(label) + ' <span class="field-help">(plusieurs choix possibles)</span></label><details class="multi-box"><summary>Afficher les choix</summary><div class="check-list">' + html + '</div></details>' + (help ? '<small class="field-help">' + escapeHtml(help) + '</small>' : '') + '</div>';
  }
  function photoField(id, label, currentId = null) {
    const preview = currentId ? '<img data-attachment="' + Number(currentId) + '" alt="Image actuelle">' : '';
    return '<div class="field wide"><label for="' + id + '">' + escapeHtml(label) + ' <span class="field-help">(facultatif)</span></label><input id="' + id + '" type="file" accept="image/png,image/jpeg,image/webp"><div class="image-preview" id="' + id + '-preview">' + preview + (currentId ? '<label class="remove-image"><input id="' + id + '-remove" type="checkbox"> Retirer l’image actuelle</label>' : '') + '</div><small class="field-help">Image PNG, JPG ou WebP · 5 Mo maximum</small></div>';
  }
  function wirePhoto(inputId) {
    const input = $(inputId);
    const preview = $(inputId + '-preview');
    const remove = $(inputId + '-remove');
    if (!input || !preview) return;
    input.onchange = () => {
      if (remove) remove.checked = false;
      const file = input.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        const currentPreview = preview.querySelector('img');
        if (currentPreview) currentPreview.src = url;
        else preview.insertAdjacentHTML('afterbegin', '<img src="' + url + '" alt="Aperçu de l’image">');
      }
    };
    if (remove) remove.onchange = () => { if (remove.checked) input.value = ''; };
  }
  async function applyPhoto(fields, label, inputId, oldId = null) {
    const file = $(inputId)?.files?.[0];
    if (file) {
      const id = await uploadImage(file);
      fields[label] = ['L', id];
      const input = $(inputId);
      const image = $(inputId + '-preview')?.querySelector('img');
      if (image) { image.dataset.attachment = String(id); image.alt = 'Image enregistrée'; }
      if (input) input.value = '';
      await loadImages($(inputId + '-preview'));
    } else if (oldId && $(inputId + '-remove')?.checked) {
      fields[label] = ['L'];
      const preview = $(inputId + '-preview');
      if (preview) preview.innerHTML = '';
    }
  }
  function selectedChecks(name) {
    return [...document.querySelectorAll('input[name="' + name + '"]:checked')].map(input => input.value);
  }
  function sectionTitle(title) { return '<h3 class="form-section-title">' + escapeHtml(title) + '</h3>'; }
  function imageTag(id, cls, alt) {
    return id ? '<img class="' + cls + '" data-attachment="' + Number(id) + '" alt="' + escapeHtml(alt) + '">' : '';
  }
  function publicText(table, row, label) {
    const value = getValue(table, row, label);
    return Array.isArray(value) ? value.join(', ') : String(value || '');
  }

  function render() {
    status('');
    if (state.page === 'detail') return renderDetail();
    if (state.page === 'form') return renderForm();
    renderHome();
  }

  function renderHome() {
    $('page-title').textContent = 'Carte d’identité des établissements';
    $('page-subtitle').textContent = 'Une fiche établissement, puis ses services et unités.';
    const query = state.search.trim().toLocaleLowerCase('fr');
    const list = rows('Etablissements').filter(row => recordName('Etablissements', row).toLocaleLowerCase('fr').includes(query));
    $('main-panel').innerHTML = '<div class="toolbar"><div><h2>Établissements</h2><p>' + list.length + ' fiche(s) enregistrée(s)</p></div><div class="toolbar-actions"><button id="new-establishment" class="button primary">＋ Ajouter un établissement</button></div></div><div class="panel"><div class="search-row"><input id="search" class="search" type="search" placeholder="Rechercher un établissement…" value="' + escapeHtml(state.search) + '"><span class="result-count">' + list.length + ' résultat(s)</span></div><div class="establishment-list" id="establishment-list"></div></div>';
    $('new-establishment').onclick = () => openForm('establishment');
    $('search').oninput = event => { state.search = event.target.value; const start = event.target.selectionStart; renderHome(); $('search').focus(); $('search').setSelectionRange(start, start); };
    const host = $('establishment-list');
    if (!list.length) {
      host.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⌂</div><h3>Aucun établissement pour le moment</h3><p>Commence par créer une fiche. Tu pourras ensuite y rattacher autant de services et d’unités que nécessaire.</p><button id="empty-add" class="button primary">＋ Créer la première fiche</button></div>';
      $('empty-add').onclick = () => openForm('establishment');
      return;
    }
    host.innerHTML = list.map(row => {
      const id = Number(row.id);
      const serviceCount = rows('Unites').filter(item => relationId('Unites', item, 'Établissement de rattachement') === id).length;
      const photo = attachmentId('Etablissements', row, "Logo ou photo de l’établissement");
      return '<button class="est-card" data-open-establishment="' + id + '"><span class="est-thumb">' + imageTag(photo, '', recordName('Etablissements', row)) + (photo ? '' : '⌂') + '</span><span class="est-card-copy"><strong>' + escapeHtml(recordName('Etablissements', row)) + '</strong><small>' + escapeHtml(getValue('Etablissements', row, 'Public de l’établissement') || 'Public non renseigné') + ' · ' + serviceCount + ' service(s) / unité(s)</small></span><span class="est-arrow" aria-hidden="true">›</span></button>';
    }).join('');
    host.querySelectorAll('[data-open-establishment]').forEach(button => button.onclick = () => {
      state.establishmentId = Number(button.dataset.openEstablishment);
      state.page = 'detail';
      render();
    });
    loadImages(host);
  }

  function renderDetail() {
    const establishment = findRow('Etablissements', state.establishmentId);
    if (!establishment) { state.page = 'home'; return renderHome(); }
    const id = Number(establishment.id);
    const places = rows('Implantations').filter(row => relationId('Implantations', row, 'Établissement de rattachement') === id);
    const services = rows('Unites').filter(row => relationId('Unites', row, 'Établissement de rattachement') === id);
    const photo = attachmentId('Etablissements', establishment, "Logo ou photo de l’établissement");
    $('page-title').textContent = 'Fiche établissement';
    $('page-subtitle').textContent = 'Les renseignements de l’établissement sont saisis une seule fois.';
    $('main-panel').innerHTML = '<button class="back-link" id="back-home">← Retour à la liste</button>'+
      '<section class="identity-card"><div class="identity-photo">' + (photo ? imageTag(photo, '', recordName('Etablissements', establishment)) : '⌂') + '</div><div class="identity-content"><h2>' + escapeHtml(recordName('Etablissements', establishment)) + '</h2><div class="identity-meta">' +
      '<span><b>Public : </b>' + escapeHtml(getValue('Etablissements', establishment, 'Public de l’établissement') || 'Non renseigné') + '</span>'+
      '<span><b>Adresse : </b>' + escapeHtml(getValue('Etablissements', establishment, 'Adresse administrative') || 'Non renseignée') + '</span>'+
      (getValue('Etablissements', establishment, 'E-mail administratif') ? '<span><b>E-mail : </b>' + escapeHtml(getValue('Etablissements', establishment, 'E-mail administratif')) + '</span>' : '')+
      (getValue('Etablissements', establishment, 'Téléphone administratif') ? '<span><b>Téléphone : </b>' + escapeHtml(getValue('Etablissements', establishment, 'Téléphone administratif')) + '</span>' : '')+
      '</div></div><div class="identity-actions"><button id="edit-establishment" class="button secondary">Modifier</button><button id="delete-establishment" class="button danger">Supprimer</button></div></section>'+
      '<section class="section"><div class="section-heading"><div class="section-heading-copy"><h3>Lieux <span class="count-badge">' + places.length + '</span></h3><p>Sites ou bâtiments de l’établissement. Cette partie est facultative.</p></div><button id="add-place" class="button secondary">＋ Ajouter un lieu</button></div><div class="place-list" id="place-list"></div></section>'+
      '<section class="section"><div class="section-heading"><div class="section-heading-copy"><h3>Services et unités <span class="count-badge">' + services.length + '</span></h3><p>Chaque SAJ, SAJ M, foyer ou autre service est une fiche distincte.</p></div><button id="add-service" class="button primary">＋ Ajouter un service / une unité</button></div><div class="record-list" id="service-list"></div></section>';
    $('back-home').onclick = () => { state.page = 'home'; render(); };
    $('edit-establishment').onclick = () => openForm('establishment', id);
    $('delete-establishment').onclick = () => removeEstablishment(id);
    $('add-place').onclick = () => openForm('place');
    $('add-service').onclick = () => openForm('unit');

    const placeHost = $('place-list');
    placeHost.innerHTML = places.length ? places.map(place => {
      const placeId = Number(place.id);
      const image = attachmentId('Implantations', place, 'Photo du lieu');
      return '<article class="place-card"><span class="record-image">' + imageTag(image, '', recordName('Implantations', place)) + (image ? '' : '⌖') + '</span><span class="record-copy"><strong>' + escapeHtml(recordName('Implantations', place)) + '</strong><p>' + escapeHtml(getValue('Implantations', place, 'Adresse complète') || '') + (getValue('Implantations', place, 'Étage(s)') ? ' · ' + escapeHtml(getValue('Implantations', place, 'Étage(s)')) : '') + '</p></span><span class="record-actions"><button class="icon-button" data-edit-place="' + placeId + '">Modifier</button><button class="icon-button delete" data-delete-place="' + placeId + '">Supprimer</button></span></article>';
    }).join('') : '<div class="record-empty">Aucun lieu enregistré. Tu peux en ajouter, mais ce n’est pas obligatoire pour créer un service.</div>';
    placeHost.querySelectorAll('[data-edit-place]').forEach(button => button.onclick = () => openForm('place', Number(button.dataset.editPlace)));
    placeHost.querySelectorAll('[data-delete-place]').forEach(button => button.onclick = () => removePlace(Number(button.dataset.deletePlace)));

    const serviceHost = $('service-list');
    serviceHost.innerHTML = services.length ? services.map(service => {
      const serviceId = Number(service.id);
      const image = attachmentId('Unites', service, "Photo ou logo de l'unité");
      const place = findRow('Implantations', relationId('Unites', service, 'Lieu'));
      const type = getValue('Unites', service, 'Type de service') || 'Type non renseigné';
      const publicNames = publicText('Unites', service, 'Public accueilli par l’unité');
      return '<article class="record-card"><span class="record-image">' + imageTag(image, '', recordName('Unites', service)) + (image ? '' : '◉') + '</span><span class="record-copy"><strong>' + escapeHtml(recordName('Unites', service)) + '</strong><p class="type-line">' + escapeHtml(type) + '</p><p>' + (place ? 'Lieu : ' + escapeHtml(recordName('Implantations', place)) : 'Lieu non précisé') + (getValue('Unites', service, 'Étage / bâtiment') ? ' · ' + escapeHtml(getValue('Unites', service, 'Étage / bâtiment')) : '') + '</p>' + (publicNames ? '<p>Public : ' + escapeHtml(publicNames) + '</p>' : '') + '</span><span class="record-actions"><button class="icon-button" data-edit-unit="' + serviceId + '">Modifier</button><button class="icon-button delete" data-delete-unit="' + serviceId + '">Supprimer</button></span></article>';
    }).join('') : '<div class="record-empty">Aucun service ni unité pour le moment. Ajoute un premier SAJ, foyer ou autre service avec le bouton ci-dessus.</div>';
    serviceHost.querySelectorAll('[data-edit-unit]').forEach(button => button.onclick = () => openForm('unit', Number(button.dataset.editUnit)));
    serviceHost.querySelectorAll('[data-delete-unit]').forEach(button => button.onclick = () => removeUnit(Number(button.dataset.deleteUnit)));
    loadImages($('main-panel'));
  }

  function openForm(type, id = null) {
    state.page = 'form';
    state.formType = type;
    state.editingId = id;
    render();
  }
  function renderForm() {
    const type = state.formType;
    const existing = state.editingId ? findRow(type === 'establishment' ? 'Etablissements' : type === 'place' ? 'Implantations' : 'Unites', state.editingId) : null;
    if (type !== 'establishment' && !state.establishmentId) { state.page = 'home'; return renderHome(); }
    const isEdit = Boolean(existing);
    let title = '', description = '', fields = '';

    if (type === 'establishment') {
      title = isEdit ? 'Modifier l’établissement' : 'Créer un établissement';
      description = 'Renseigne une seule fois les informations communes à tous ses services.';
      fields = sectionTitle('Informations de l’établissement') +
        field('name', "Nom de l'établissement", getValue('Etablissements', existing, "Nom de l'établissement") || '', {required:true,wide:true,placeholder:'Ex. nom de l’établissement'}) +
        selectField('audience', 'Public de l’établissement', ESTABLISHMENT_PUBLICS, getValue('Etablissements', existing, 'Public de l’établissement') || '', true, 'Choisis une seule catégorie.') +
        field('admin-address', 'Adresse administrative', getValue('Etablissements', existing, 'Adresse administrative') || '', {wide:true,textarea:true,placeholder:'Adresse, code postal et commune'}) +
        field('admin-email', 'E-mail administratif', getValue('Etablissements', existing, 'E-mail administratif') || '', {type:'email',placeholder:'exemple@association.fr'}) +
        field('admin-phone', 'Téléphone administratif', getValue('Etablissements', existing, 'Téléphone administratif') || '', {type:'tel',placeholder:'Numéro de téléphone'}) +
        photoField('photo', "Logo ou photo de l’établissement", attachmentId('Etablissements', existing, "Logo ou photo de l’établissement"));
    } else if (type === 'place') {
      title = isEdit ? 'Modifier le lieu' : 'Ajouter un lieu';
      description = 'Cette étape est facultative. Un service peut être enregistré même sans lieu.';
      fields = sectionTitle('Lieu ou bâtiment') +
        field('name', 'Nom du lieu', getValue('Implantations', existing, 'Nom du lieu') || '', {required:true,placeholder:'Ex. bâtiment principal'}) +
        field('place-address', 'Adresse complète', getValue('Implantations', existing, 'Adresse complète') || '', {wide:true,textarea:true,placeholder:'Adresse, code postal et commune'}) +
        field('place-floor', 'Étage(s)', getValue('Implantations', existing, 'Étage(s)') || '', {placeholder:'Ex. rez-de-chaussée, 1er étage'}) +
        photoField('photo', 'Photo du lieu', attachmentId('Implantations', existing, 'Photo du lieu'));
    } else {
      title = isEdit ? 'Modifier le service ou l’unité' : 'Ajouter un service ou une unité';
      description = 'Crée une fiche par SAJ, SAJ M, foyer ou autre service. Le lieu et la photo sont facultatifs.';
      const oldType = getValue('Unites', existing, 'Type de service') || '';
      const typeOptions = [...SERVICE_TYPES];
      if (oldType && !typeOptions.includes(oldType)) typeOptions.push(oldType);
      const placeOptions = rows('Implantations').filter(row => relationId('Implantations', row, 'Établissement de rattachement') === Number(state.establishmentId)).map(row => '<option value="' + Number(row.id) + '" ' + (relationId('Unites', existing, 'Lieu') === Number(row.id) ? 'selected' : '') + '>' + escapeHtml(recordName('Implantations', row)) + '</option>').join('');
      const oldPublics = getValue('Unites', existing, 'Public accueilli par l’unité') || [];
      const oldModalities = getValue('Unites', existing, "Modalités d'accueil") || [];
      const oldOrientations = getValue('Unites', existing, 'Orientations / notifications (foyers uniquement)') || [];
      fields = sectionTitle('Fiche du service') +
        field('name', "Nom de l'unité / du service", getValue('Unites', existing, "Nom de l'unité / du service") || '', {required:true,placeholder:'Ex. accueil de jour'}) +
        '<div class="field"><label for="service-type">Type de service <span class="required">*</span></label><select id="service-type" required><option value="">Choisir…</option>' + typeOptions.map(value => '<option value="' + escapeHtml(value) + '" ' + (value === oldType ? 'selected' : '') + '>' + escapeHtml(value) + '</option>').join('') + '</select></div>' +
        '<div class="field wide' + (!String(oldType).startsWith('Autre') ? ' hidden' : '') + '" id="other-type-wrap">' + field('other-type', 'Préciser le type de service', getValue('Unites', existing, 'Précision du type (si autre)') || '', {placeholder:'Saisir le type'}) + '</div>' +
        multiField('publics', 'Public accueilli par l’unité', UNIT_PUBLICS, oldPublics, 'Plusieurs publics peuvent être sélectionnés.') +
        field('public-details', 'Précisions sur le public', getValue('Unites', existing, 'Précisions sur le public') || '', {wide:true,textarea:true,placeholder:'Précision facultative'}) +
        sectionTitle('Lieu et accueil (facultatifs)') +
        '<div class="field"><label for="place">Lieu ou bâtiment</label><select id="place"><option value="">Aucun lieu précisé</option>' + placeOptions + '</select>' + (!rows('Implantations').some(row => relationId('Implantations', row, 'Établissement de rattachement') === Number(state.establishmentId)) ? '<small class="field-help">Tu peux continuer sans lieu. Pour en ajouter un, retourne à la fiche établissement.</small>' : '') + '</div>' +
        field('unit-floor', 'Étage / bâtiment', getValue('Unites', existing, 'Étage / bâtiment') || '', {placeholder:'Ex. 1er étage, aile B'}) +
        multiField('modalities', "Modalités d'accueil", MODALITIES, oldModalities) +
        '<div class="field wide' + (!isFoyer(oldType) ? ' hidden' : '') + '" id="foyer-options">' + multiField('orientations', 'Orientations / notifications (foyers uniquement)', FOYER_OPTIONS, oldOrientations) + '</div>' +
        photoField('photo', "Photo ou logo de l'unité / du service", attachmentId('Unites', existing, "Photo ou logo de l'unité"));
    }

    $('page-title').textContent = title;
    $('page-subtitle').textContent = description;
    $('main-panel').innerHTML = '<button class="back-link" id="cancel-form">← Retour à la fiche</button><div class="form-wrap"><div class="form-head"><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(description) + '</p></div><form id="record-form" class="form-card" novalidate><div class="field-grid">' + fields + '</div><p class="hint-box">Les champs marqués d’une étoile sont obligatoires. Les photos et les lieux peuvent être ajoutés plus tard.</p><p id="autosave-status" class="autosave-status" aria-live="polite">Les changements seront enregistrés dans Grist dès que les champs obligatoires seront remplis.</p><div class="form-actions"><button id="cancel-button" type="button" class="button secondary">Retour à la fiche</button><button id="save-button" type="submit" class="button primary">' + (isEdit ? 'Terminer et revenir à la fiche' : 'Terminer et enregistrer') + '</button></div></form></div>';
    $('cancel-form').onclick = $('cancel-button').onclick = () => { clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null; state.page = type === 'establishment' && !state.establishmentId ? 'home' : 'detail'; state.formType = null; state.editingId = null; render(); };
    $('record-form').onsubmit = event => saveForm(event);
    wirePhoto('photo');
    $('record-form').addEventListener('input', scheduleAutoSave);
    $('record-form').addEventListener('change', scheduleAutoSave);
    if (type === 'unit') {
      $('service-type').onchange = () => {
        $('other-type-wrap').classList.toggle('hidden', !$('service-type').value.startsWith('Autre'));
        $('foyer-options').classList.toggle('hidden', !isFoyer($('service-type').value));
      };
    }
    loadImages($('main-panel'));
  }

  function isFoyer(value) { return /foyer de vie|foyer d’hébergement|foyer d'hebergement/i.test(String(value || '')); }
  function currentFormTable() {
    const type = state.formType;
    return type === 'establishment' ? 'Etablissements' : type === 'place' ? 'Implantations' : 'Unites';
  }
  function currentPhotoLabel() {
    return state.formType === 'establishment' ? "Logo ou photo de l’établissement" : state.formType === 'place' ? 'Photo du lieu' : "Photo ou logo de l'unité";
  }
  function readFormValues() {
    const type = state.formType;
    const fields = {};
    if (type === 'establishment') {
      fields["Nom de l'établissement"] = $('name').value.trim();
      fields['Public de l’établissement'] = $('audience').value;
      fields['Adresse administrative'] = $('admin-address').value.trim();
      fields['E-mail administratif'] = $('admin-email').value.trim();
      fields['Téléphone administratif'] = $('admin-phone').value.trim();
    } else if (type === 'place') {
      fields['Établissement de rattachement'] = Number(state.establishmentId);
      fields['Nom du lieu'] = $('name').value.trim();
      fields['Adresse complète'] = $('place-address').value.trim();
      fields['Étage(s)'] = $('place-floor').value.trim();
    } else {
      fields["Nom de l'unité / du service"] = $('name').value.trim();
      fields['Établissement de rattachement'] = Number(state.establishmentId);
      fields['Type de service'] = $('service-type').value;
      fields['Précision du type (si autre)'] = $('other-type').value.trim();
      fields['Public accueilli par l’unité'] = ['L', ...selectedChecks('publics')];
      fields['Précisions sur le public'] = $('public-details').value.trim();
      fields['Lieu'] = $('place').value ? Number($('place').value) : null;
      fields['Étage / bâtiment'] = $('unit-floor').value.trim();
      fields["Modalités d'accueil"] = ['L', ...selectedChecks('modalities')];
      fields['Orientations / notifications (foyers uniquement)'] = isFoyer($('service-type').value) ? ['L', ...selectedChecks('orientations')] : ['L'];
    }
    return fields;
  }
  function requiredFieldsReady(fields) {
    if (state.formType === 'establishment') return Boolean(fields["Nom de l'établissement"] && fields['Public de l’établissement']);
    if (state.formType === 'place') return Boolean(fields['Nom du lieu']);
    return Boolean(fields["Nom de l'unité / du service"] && fields['Type de service']);
  }
  function setAutoSaveText(text, kind = '') {
    const node = $('autosave-status');
    if (!node) return;
    node.textContent = text;
    node.className = 'autosave-status' + (kind ? ' ' + kind : '');
  }
  function scheduleAutoSave() {
    if (state.page !== 'form') return;
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
    const fields = readFormValues();
    if (!requiredFieldsReady(fields)) {
      setAutoSaveText('Complète les champs obligatoires pour démarrer l’enregistrement automatique.');
      return;
    }
    setAutoSaveText('Modifications en attente d’enregistrement…');
    state.autoSaveTimer = setTimeout(runAutoSave, 700);
  }
  async function persistForm() {
    const table = currentFormTable();
    const fields = readFormValues();
    const photoLabel = currentPhotoLabel();
    const existing = state.editingId ? findRow(table, state.editingId) : null;
    await applyPhoto(fields, photoLabel, 'photo', attachmentId(table, existing, photoLabel));
    let savedId = state.editingId;
    if (existing) await updateRecord(table, existing.id, fields);
    else savedId = await createRecord(table, fields);
    state.editingId = Number(savedId);
    if (state.formType === 'establishment') state.establishmentId = Number(savedId);
    await loadData();
  }
  async function runAutoSave() {
    state.autoSaveTimer = null;
    if (state.saving || state.page !== 'form') { state.autoSaveQueued = true; return; }
    const fields = readFormValues();
    if (!requiredFieldsReady(fields)) return;
    state.saving = true;
    const button = $('save-button');
    if (button) button.disabled = true;
    setAutoSaveText('Enregistrement dans Grist…');
    try {
      await persistForm();
      setAutoSaveText('Enregistré automatiquement dans Grist. Tu peux continuer ou revenir plus tard.', 'saved');
    } catch (error) {
      setAutoSaveText('Échec de l’enregistrement : ' + (error.message || String(error)), 'failed');
    } finally {
      state.saving = false;
      if (button) button.disabled = false;
      if (state.autoSaveQueued) {
        state.autoSaveQueued = false;
        state.autoSaveTimer = setTimeout(runAutoSave, 100);
      }
    }
  }
  async function saveForm(event) {
    event.preventDefault();
    if (state.saving) { setAutoSaveText('Un enregistrement est en cours. Attends quelques secondes puis réessaie.'); return; }
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
    if (!$('record-form').reportValidity()) return;
    state.saving = true;
    const button = $('save-button');
    button.disabled = true;
    button.textContent = 'Enregistrement…';
    setAutoSaveText('Vérification de la fiche dans Grist…');
    try {
      await persistForm();
      const type = state.formType;
      state.page = type === 'establishment' ? 'detail' : 'detail';
      state.formType = null; state.editingId = null;
      render();
      status('Fiche enregistrée et vérifiée dans Grist.', 'success');
    } catch (error) {
      setAutoSaveText('Échec de l’enregistrement : ' + (error.message || String(error)), 'failed');
      status(error.message || String(error), 'error');
      button.disabled = false;
      button.textContent = 'Réessayer l’enregistrement';
    } finally { state.saving = false; }
  }

  async function removeUnit(id) {
    const row = findRow('Unites', id);
    if (!row || !confirm('Supprimer la fiche « ' + recordName('Unites', row) + ' » ?')) return;
    try { await deleteRecord('Unites', id); await refreshDetail('La fiche du service a été supprimée.'); }
    catch (error) { status(error.message || String(error), 'error'); }
  }
  async function removePlace(id) {
    const row = findRow('Implantations', id);
    if (!row) return;
    const linked = rows('Unites').filter(unit => relationId('Unites', unit, 'Lieu') === Number(id));
    const detail = linked.length ? ' Les ' + linked.length + ' service(s) liés resteront enregistrés, mais leur lieu sera retiré.' : '';
    if (!confirm('Supprimer le lieu « ' + recordName('Implantations', row) + ' » ?' + detail)) return;
    try {
      for (const unit of linked) await updateRecord('Unites', unit.id, {'Lieu': null});
      await deleteRecord('Implantations', id);
      await refreshDetail('Le lieu a été supprimé.');
    } catch (error) { status(error.message || String(error), 'error'); }
  }
  async function removeEstablishment(id) {
    const row = findRow('Etablissements', id);
    if (!row) return;
    const units = rows('Unites').filter(unit => relationId('Unites', unit, 'Établissement de rattachement') === Number(id));
    const places = rows('Implantations').filter(place => relationId('Implantations', place, 'Établissement de rattachement') === Number(id));
    const message = 'Supprimer l’établissement « ' + recordName('Etablissements', row) + ' » ?\n\nCela supprimera aussi ' + units.length + ' service(s) / unité(s) et ' + places.length + ' lieu(x) qui lui sont rattachés.';
    if (!confirm(message)) return;
    try {
      for (const unit of units) await deleteRecord('Unites', unit.id);
      for (const place of places) await deleteRecord('Implantations', place.id);
      await deleteRecord('Etablissements', id);
      state.establishmentId = null; state.page = 'home';
      await loadData(); render(); status('Établissement supprimé.', 'success');
    } catch (error) { status(error.message || String(error), 'error'); }
  }
  async function refreshDetail(message) {
    await loadData();
    state.page = 'detail';
    render();
    status(message, 'success');
  }

  async function start() {
    try {
      if (typeof grist === 'undefined') throw new Error('Ouvre ce widget depuis un document Grist.');
      await loadData();
      render();
    } catch (error) {
      connection('À vérifier', false);
      $('main-panel').innerHTML = '<div class="panel empty-state"><div class="empty-icon">!</div><h3>Le widget ne peut pas lire les tables</h3><p>' + escapeHtml(error.message || String(error)) + '</p><p>Dans Grist, autorise l’accès complet au document puis recharge le widget.</p></div>';
    }
  }

  if (typeof grist !== 'undefined') grist.ready({requiredAccess: 'full'});
  start();
})();
