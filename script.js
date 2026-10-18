(() => {
  'use strict';

  // Widget Grist : créer une fiche guidée, enregistrer les lieux puis les unités.
  const TABLES = ['Association', 'Poles', 'Etablissements', 'Implantations', 'Unites'];
  const TITLES = {
    Association: 'Nom de l’association', Poles: 'Nom du pôle',
    Etablissements: 'Nom de l’établissement', Implantations: 'Nom du lieu / site',
    Unites: 'Nom de l’unité / du service'
  };
  const LABELS = {
    Association: 'Charte commune', Poles: 'Pôles', Etablissements: 'Établissements',
    Implantations: 'Lieux', Unites: 'Unités'
  };
  const SERVICE_TYPES = [
    'Foyer de vie (FV)', 'Foyer d’hébergement (FH)',
    'Établissement d’accueil médicalisé (EAM, ex-FAM)',
    'Maison d’accueil spécialisée (MAS)', 'Service d’accueil de jour (SAJ)',
    'SAJ médicalisé (SAJM)', 'Autre / à préciser'
  ];
  const WELCOME_MODES = [
    'Accueil permanent', 'Accueil temporaire', 'Accueil de répit', 'Accueil de jour',
    'Internat de semaine', 'Internat séquentiel', 'Semi-internat',
    'Hébergement externalisé', 'Logement ou stage', 'Habitat groupé',
    'Accompagnement à domicile', 'Vacances / répit', 'Intervention multisite',
    'Autre / à préciser'
  ];
  const PLACE_TYPES = ['Site principal', 'Antenne', 'Bâtiment', 'Logement / appartement', 'Autre / à préciser'];

  const $ = id => document.getElementById(id);
  const state = {
    data: {}, columns: {}, selected: null, search: '', busy: false,
    wizard: {active: false, step: 1, establishmentId: null, locations: [], units: []},
    editor: null
  };
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function unwrap(value) {
    if (!Array.isArray(value)) return value;
    const code = value[0];
    if (code === 'R') return Number(value.length >= 3 ? value[2] : value[1]) || null;
    if (code === 'r') {
      const raw = value.length >= 3 ? value[2] : value[1];
      return Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
    }
    if (code === 'L') return value.slice(1).flatMap(v => Array.isArray(v) ? v : [v]);
    if (code === 'd' || code === 'D') return value[1] ?? null;
    if (code === 'E') return '';
    return value;
  }
  function colId(table, label) {
    return state.columns[table]?.[norm(label)] || null;
  }
  function val(table, row, label) {
    const key = colId(table, label);
    return key && row ? unwrap(row[key]) : null;
  }
  function rows(table) { return state.data[table] || []; }
  function byId(table, id) { return rows(table).find(r => Number(r.id) === Number(id)); }
  function displayName(table, row) { return String(val(table, row, TITLES[table]) || 'Fiche sans nom'); }
  function relationName(table, id) {
    const row = id ? byId(table, id) : null;
    return row ? displayName(table, row) : '';
  }
  function selectedEstablishment() { return byId('Etablissements', state.selected); }

  function setMessage(message, kind = 'info') {
    const box = $('message');
    box.textContent = message || '';
    box.className = message ? `message ${kind}` : 'message hidden';
  }
  function setConnection(text, ok = true) {
    $('connection').textContent = text;
    $('connection').classList.toggle('offline', !ok);
  }

  async function loadColumnNames() {
    state.columns = {};
    const [tablesMeta, columnsMeta] = await Promise.all([
      grist.docApi.fetchTable('_grist_Tables'),
      grist.docApi.fetchTable('_grist_Tables_column')
    ]);
    const tableRef = {};
    (tablesMeta.tableId || []).forEach((name, i) => { tableRef[name] = Number(tablesMeta.id?.[i]); });
    for (const table of TABLES) {
      const ref = tableRef[table];
      if (!ref) continue;
      const map = {};
      (columnsMeta.colId || []).forEach((id, i) => {
        const parent = unwrap(columnsMeta.parentId?.[i]);
        const label = columnsMeta.label?.[i];
        if (Number(parent) === ref && label) map[norm(label)] = id;
      });
      state.columns[table] = map;
    }
  }

  async function loadData() {
    setConnection('Lecture de Grist…');
    try {
      const available = await grist.docApi.listTables();
      const missing = TABLES.filter(t => !available.includes(t));
      if (missing.length) throw new Error(`Table(s) manquante(s) : ${missing.join(', ')}.`);
      await loadColumnNames();
      for (const table of TABLES) {
        const raw = await grist.docApi.fetchTable(table);
        const keys = Object.keys(raw).filter(k => k !== 'id');
        state.data[table] = (raw.id || []).map((id, i) => {
          const row = {id};
          for (const key of keys) row[key] = raw[key]?.[i];
          return row;
        });
      }
      setConnection('Connecté à Grist');
      applyTheme();
      render();
    } catch (error) {
      setConnection('Connexion à vérifier', false);
      setMessage(`Le widget n’a pas pu lire les tables. Dans Grist, autorise l’accès demandé par le widget, puis recharge-le.\n\nDétail : ${error?.message || error}`, 'error');
      throw error;
    }
  }

  function applyTheme() {
    const association = rows('Association')[0];
    const color = (label, fallback) => {
      const v = val('Association', association, label);
      return /^#[\da-f]{6}$/i.test(String(v || '')) ? v : fallback;
    };
    document.documentElement.style.setProperty('--blue', color('Couleur principale (HEX)', '#173d64'));
    document.documentElement.style.setProperty('--orange', color('Couleur secondaire (HEX)', '#de8436'));
    document.documentElement.style.setProperty('--green', color('Couleur d’accent (HEX)', '#a9c442'));
    const logo = $('brand');
    const id = attachmentIds(val('Association', association, 'Logo de l’association'))[0];
    if (!id) { logo.textContent = 'O'; return; }
    attachmentUrl(id).then(url => { if (url) logo.innerHTML = `<img src="${esc(url)}" alt="Logo de l’association">`; });
  }

  function attachmentIds(value) {
    const unwrapped = unwrap(value);
    if (Array.isArray(unwrapped)) return unwrapped.flat(Infinity).map(Number).filter(n => Number.isFinite(n) && n > 0);
    const n = Number(unwrapped);
    return Number.isFinite(n) && n > 0 ? [n] : [];
  }
  async function attachmentUrl(id) {
    try {
      const token = await grist.docApi.getAccessToken({readOnly: true});
      return `${token.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token.token)}`;
    } catch (_) { return null; }
  }
  async function uploadImage(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Choisis un fichier image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('La photo dépasse 8 Mo. Choisis une image plus légère.');
    const token = await grist.docApi.getAccessToken({readOnly: false});
    const form = new FormData();
    form.append('upload', file, file.name);
    const response = await fetch(`${token.baseUrl}/attachments?auth=${encodeURIComponent(token.token)}`, {
      method: 'POST', headers: {'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'}, body: form
    });
    if (!response.ok) throw new Error(`Grist a refusé la photo (erreur ${response.status}).`);
    const body = await response.json();
    const id = Array.isArray(body) ? body[0] : (body.id ?? body.attachmentId ?? body);
    if (!Number(id)) throw new Error('Grist a reçu la photo mais n’a pas renvoyé son identifiant.');
    return Number(id);
  }

  function payloadFor(table, fields) {
    const payload = {};
    for (const [label, value] of Object.entries(fields)) {
      const key = colId(table, label);
      if (!key) continue;
      payload[key] = value;
    }
    return payload;
  }
  function requiredColumn(table, label) {
    if (!colId(table, label)) throw new Error(`La colonne « ${label} » est introuvable dans la table « ${table} ». Vérifie son intitulé dans Grist.`);
  }
  async function createRecord(table, fields) {
    const payload = payloadFor(table, fields);
    const result = await grist.getTable(table).create(payload);
    const id = Number(result?.id ?? result?.[0]?.id);
    if (!id) throw new Error(`Grist n’a pas confirmé la création dans la table « ${table} ».`);
    return id;
  }
  async function updateRecord(table, id, fields) {
    const payload = payloadFor(table, fields);
    await grist.getTable(table).update({id: Number(id), ...payload});
  }
  function refList(table, row, label) {
    const current = val(table, row, label);
    if (Array.isArray(current)) return current.map(Number).filter(Boolean);
    return current ? [Number(current)] : [];
  }

  function renderList() {
    const query = state.search.trim().toLocaleLowerCase('fr');
    const establishments = rows('Etablissements').filter(row => !query ||
      `${displayName('Etablissements', row)} ${val('Etablissements', row, 'Adresse e-mail administrative') || ''}`.toLocaleLowerCase('fr').includes(query));
    $('list-count').textContent = establishments.length;
    if (!establishments.length) {
      $('establishment-list').innerHTML = '<div class="empty-list">Aucune fiche pour le moment.<br>Clique sur « Créer une fiche » pour commencer.</div>';
      return;
    }
    $('establishment-list').innerHTML = establishments.map(row => {
      const active = Number(row.id) === Number(state.selected) ? ' selected' : '';
      const subtitle = [relationName('Poles', val('Etablissements', row, 'Pôle de rattachement (facultatif)')),
        `${refList('Etablissements', row, 'Implantations / lieux (plusieurs possibles)').length} lieu(x)`].filter(Boolean).join(' · ');
      return `<button class="list-item${active}" data-id="${Number(row.id)}"><span class="list-icon">⌂</span><span><strong>${esc(displayName('Etablissements', row))}</strong><small>${esc(subtitle)}</small></span></button>`;
    }).join('');
    $('establishment-list').querySelectorAll('[data-id]').forEach(button => button.onclick = () => {
      state.selected = Number(button.dataset.id); state.wizard.active = false; state.wizard.establishmentId = null; render();
    });
  }

  function renderProgress(active) {
    const names = ['Établissement', 'Lieux', 'Unités'];
    return `<ol class="steps">${names.map((name, index) => {
      const n = index + 1;
      const cls = n < active ? 'done' : n === active ? 'current' : '';
      const mark = n < active ? '✓' : String(n);
      return `<li class="${cls}"><span>${mark}</span><b>${name}</b></li>`;
    }).join('')}</ol>`;
  }

  function field(label, inputHtml, help = '', wide = false) {
    return `<div class="field${wide ? ' wide' : ''}"><label>${esc(label)}</label>${inputHtml}${help ? `<small>${esc(help)}</small>` : ''}</div>`;
  }
  function textInput(id, label, value = '', required = false, placeholder = '', type = 'text') {
    return field(label, `<input id="${id}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} placeholder="${esc(placeholder)}">`);
  }
  function selectInput(id, label, options, current = '', allowBlank = true) {
    return field(label, `<select id="${id}">${allowBlank ? '<option value="">Aucun / choisir…</option>' : ''}${options.map(o => {
      const option = typeof o === 'object' ? o : {id: o, name: o};
      return `<option value="${esc(option.id)}" ${String(current) === String(option.id) ? 'selected' : ''}>${esc(option.name)}</option>`;
    }).join('')}</select>`);
  }
  function fileInput(id, label, currentUrl = null) {
    return field(label, `<input id="${id}" type="file" accept="image/png,image/jpeg,image/webp"><div class="photo-help">JPG, PNG ou WebP · 8 Mo maximum</div>${currentUrl ? `<img class="preview" src="${esc(currentUrl)}" alt="Photo actuelle">` : ''}`, 'Facultatif', true);
  }
  function poleOptions(selected = '') {
    return rows('Poles').map(r => ({id: r.id, name: displayName('Poles', r)}));
  }

  function openCharterEditor() {
    const existing = rows('Association')[0] || null;
    const dialog = $('edit-dialog');
    const currentColor = (label, fallback) => {
      const value = val('Association', existing, label);
      return /^#[\da-f]{6}$/i.test(String(value || '')) ? value : fallback;
    };
    dialog.innerHTML = `<div class="dialog-head"><h2>Charte graphique commune</h2><button type="button" class="icon-button" id="close-dialog" aria-label="Fermer">×</button></div><form id="charter-form" class="dialog-body"><p class="section-help">Ces informations sont saisies une seule fois pour l’association et servent de base à l’affichage des fiches.</p><div class="field-grid">
      ${textInput('charter-name', 'Nom de l’association', val('Association', existing, 'Nom de l’association') || 'Odynéo', true)}
      ${fileInput('charter-logo', 'Logo de l’association')}
      ${textInput('charter-primary', 'Couleur principale (HEX)', currentColor('Couleur principale (HEX)', '#173d64'), false, '#173D64')}
      ${textInput('charter-secondary', 'Couleur secondaire (HEX)', currentColor('Couleur secondaire (HEX)', '#de8436'), false, '#DE8436')}
      ${textInput('charter-accent', 'Couleur d’accent (HEX)', currentColor('Couleur d’accent (HEX)', '#a9c442'), false, '#A9C442')}
      ${textInput('charter-font', 'Police (facultative)', val('Association', existing, 'Police (facultative)') || '')}
      ${textInput('charter-reference', 'Référence de la charte', val('Association', existing, 'Référence de la charte') || '')}
      ${textInput('charter-date', 'Date de vérification', '', false, '', 'date')}
      ${field('Notes (facultatif)', `<textarea id="charter-notes" rows="3">${esc(val('Association', existing, 'Notes') || '')}</textarea>`, '', true)}
    </div><div class="dialog-actions"><button class="button primary" type="submit">Enregistrer la charte</button><button class="button quiet" id="cancel-dialog" type="button">Annuler</button></div></form>`;
    $('close-dialog').onclick = () => dialog.close();
    $('cancel-dialog').onclick = () => dialog.close();
    $('charter-form').onsubmit = async event => {
      event.preventDefault();
      try {
        requiredColumn('Association', 'Nom de l’association');
        const fields = {
          'Nom de l’association': $('charter-name').value.trim(),
          'Couleur principale (HEX)': $('charter-primary').value.trim() || null,
          'Couleur secondaire (HEX)': $('charter-secondary').value.trim() || null,
          'Couleur d’accent (HEX)': $('charter-accent').value.trim() || null,
          'Police (facultative)': $('charter-font').value.trim() || null,
          'Référence de la charte': $('charter-reference').value.trim() || null,
          'Date de vérification': $('charter-date').value ? ['d', Math.floor(new Date(`${$('charter-date').value}T00:00:00`).getTime() / 1000)] : null,
          'Notes': $('charter-notes').value.trim() || null
        };
        const logoId = await uploadImage($('charter-logo').files?.[0]);
        if (logoId) fields['Logo de l’association'] = ['L', logoId];
        if (existing) await updateRecord('Association', existing.id, fields);
        else await createRecord('Association', fields);
        dialog.close(); await loadData(); setMessage('Charte commune enregistrée.');
      } catch (error) { setMessage(error?.message || String(error), 'error'); }
    };
    dialog.showModal();
  }

  function startWizard() {
    state.selected = null;
    state.wizard = {active: true, step: 1, establishmentId: null, locations: [], units: []};
    state.editor = null;
    render();
  }

  function renderStepOne() {
    const edit = state.wizard.establishmentId ? byId('Etablissements', state.wizard.establishmentId) : null;
    const photoId = attachmentIds(val('Etablissements', edit, 'Photo de l’établissement'))[0];
    const urlPromise = photoId ? attachmentUrl(photoId) : Promise.resolve(null);
    $('main-panel').innerHTML = `<div class="form-heading"><div><h2>${edit ? 'Modifier les informations' : 'Créer une carte d’identité'}</h2><p>Commence par les informations générales. Tu pourras compléter la fiche ensuite.</p></div></div>${renderProgress(1)}<form id="step-form" class="form-card"><div class="form-section"><h3>L’établissement</h3><div class="field-grid">
      ${textInput('est-name', 'Nom de l’établissement', val('Etablissements', edit, 'Nom de l’établissement') || '', true, 'Ex. Nom de la structure')}
      ${selectInput('est-pole', 'Pôle de rattachement (facultatif)', poleOptions(), val('Etablissements', edit, 'Pôle de rattachement (facultatif)') || '')}
      ${fileInput('est-photo', 'Photo de l’établissement')}
      ${textInput('est-email', 'Adresse e-mail administrative', val('Etablissements', edit, 'Adresse e-mail administrative') || '', false, 'Ex. contact@structure.fr', 'email')}
      ${textInput('est-phone', 'Téléphone administratif', val('Etablissements', edit, 'Téléphone administratif') || '', false, 'Ex. 04 00 00 00 00', 'tel')}
    </div></div><div class="form-actions"><button class="button primary" type="submit">${edit ? 'Enregistrer les modifications' : 'Enregistrer et continuer'} <span>→</span></button><button class="button quiet" type="button" id="step-cancel">Annuler</button></div></form>`;
    urlPromise.then(url => { const p = $('est-photo')?.parentElement; if (url && p && !p.querySelector('.preview')) p.insertAdjacentHTML('beforeend', `<img class="preview" src="${esc(url)}" alt="Photo actuelle">`); });
    $('step-form').onsubmit = async event => {
      event.preventDefault(); await saveEstablishment();
    };
    $('step-cancel').onclick = () => { state.selected = edit ? Number(edit.id) : null; state.wizard.active = false; state.wizard.establishmentId = null; render(); };
  }

  async function saveEstablishment() {
    if (state.busy) return;
    state.busy = true; setMessage('Enregistrement de l’établissement…');
    try {
      requiredColumn('Etablissements', 'Nom de l’établissement');
      const photo = $('est-photo').files?.[0];
      const fields = {
        'Nom de l’établissement': $('est-name').value.trim(),
        'Pôle de rattachement (facultatif)': $('est-pole').value ? Number($('est-pole').value) : null,
        'Adresse e-mail administrative': $('est-email').value.trim() || null,
        'Téléphone administratif': $('est-phone').value.trim() || null
      };
      const photoId = await uploadImage(photo);
      if (photoId) fields['Photo de l’établissement'] = ['L', photoId];
      if (state.wizard.establishmentId) {
        await updateRecord('Etablissements', state.wizard.establishmentId, fields);
      } else {
        state.wizard.establishmentId = await createRecord('Etablissements', fields);
      }
      state.selected = state.wizard.establishmentId;
      state.wizard.step = 2;
      await loadData();
      setMessage('Établissement enregistré. Tu peux maintenant ajouter un ou plusieurs lieux.');
    } catch (error) { setMessage(error?.message || String(error), 'error'); }
    finally { state.busy = false; }
  }

  function renderStepTwo() {
    const parent = byId('Etablissements', state.wizard.establishmentId);
    const ids = refList('Etablissements', parent, 'Implantations / lieux (plusieurs possibles)');
    const locations = ids.map(id => byId('Implantations', id)).filter(Boolean);
    $('main-panel').innerHTML = `<div class="form-heading"><div><h2>Ajouter les lieux</h2><p>Un lieu correspond à une adresse ou à un site. Si l’établissement n’a qu’un seul lieu, ajoute-le une seule fois.</p></div></div>${renderProgress(2)}<div class="form-card"><div class="saved-subrecords"><h3>Lieux déjà enregistrés <span>${locations.length}</span></h3>${locations.length ? locations.map(r => `<div class="saved-row"><span class="round-icon orange">⌖</span><div><strong>${esc(displayName('Implantations', r))}</strong><small>${esc([val('Implantations', r, 'Adresse'), val('Implantations', r, 'Commune')].filter(Boolean).join(' · ') || 'Adresse à compléter')}</small></div></div>`).join('') : '<div class="notice">Aucun lieu ajouté. Crée au moins un lieu pour pouvoir rattacher les unités.</div>'}</div><form id="location-form"><div class="form-section"><h3>Nouveau lieu</h3><div class="field-grid">
      ${textInput('loc-name', 'Nom du lieu', '', true, 'Ex. Site principal')}
      ${selectInput('loc-type', 'Type de lieu', PLACE_TYPES, '')}
      ${textInput('loc-address', 'Adresse', '', true, 'Numéro et nom de rue')}
      ${textInput('loc-complement', 'Complément d’adresse', '', false, 'Bâtiment, résidence…')}
      ${textInput('loc-postcode', 'Code postal', '', true, 'Ex. 69000')}
      ${textInput('loc-town', 'Commune', '', true, 'Ex. Lyon')}
      ${textInput('loc-department', 'Département', '', false, 'Ex. Rhône')}
    </div><small class="section-help">L’étage sera indiqué pour chaque unité à l’étape suivante : plusieurs unités d’un même lieu peuvent se trouver à des étages différents.</small></div><div class="form-actions"><button class="button secondary" type="submit">＋ Enregistrer ce lieu</button><button class="button primary" type="button" id="to-units">Continuer vers les unités <span>→</span></button><button class="button quiet" type="button" id="back-est">← Retour</button></div></form></div>`;
    $('location-form').onsubmit = async event => { event.preventDefault(); await addLocation(); };
    $('to-units').onclick = () => {
      const latest = refList('Etablissements', byId('Etablissements', state.wizard.establishmentId), 'Implantations / lieux (plusieurs possibles)');
      if (!latest.length) {
        setMessage('Ajoute au moins un lieu pour cet établissement avant de continuer.', 'error'); return;
      }
      state.wizard.step = 3; render();
    };
    $('back-est').onclick = () => { state.wizard.step = 1; render(); };
  }

  async function addLocation() {
    if (state.busy) return;
    state.busy = true; setMessage('Enregistrement du lieu…');
    try {
      requiredColumn('Implantations', 'Nom du lieu / site');
      requiredColumn('Implantations', 'Adresse');
      requiredColumn('Implantations', 'Code postal');
      requiredColumn('Implantations', 'Commune');
      requiredColumn('Etablissements', 'Implantations / lieux (plusieurs possibles)');
      const fields = {
        'Nom du lieu / site': $('loc-name').value.trim(),
        'Type de lieu': $('loc-type').value || null,
        'Adresse': $('loc-address').value.trim(),
        'Complément d’adresse': $('loc-complement').value.trim() || null,
        'Code postal': $('loc-postcode').value.trim(),
        'Commune': $('loc-town').value.trim(),
        'Département': $('loc-department').value.trim() || null
      };
      const id = await createRecord('Implantations', fields);
      const parent = byId('Etablissements', state.wizard.establishmentId);
      const current = refList('Etablissements', parent, 'Implantations / lieux (plusieurs possibles)');
      await updateRecord('Etablissements', state.wizard.establishmentId, {
        'Implantations / lieux (plusieurs possibles)': ['r', 'Implantations', [...new Set([...current, id])]]
      });
      state.wizard.locations.push(id);
      await loadData();
      setMessage('Lieu enregistré. Tu peux en ajouter un autre ou continuer.');
    } catch (error) { setMessage(error?.message || String(error), 'error'); }
    finally { state.busy = false; }
  }

  function renderStepThree() {
    const parent = byId('Etablissements', state.wizard.establishmentId);
    const locationIds = refList('Etablissements', parent, 'Implantations / lieux (plusieurs possibles)');
    const locations = locationIds.map(id => byId('Implantations', id)).filter(Boolean);
    const units = rows('Unites').filter(r => Number(val('Unites', r, 'Établissement de rattachement')) === Number(state.wizard.establishmentId));
    const locationOpts = locations.map(r => ({id: r.id, name: displayName('Implantations', r)}));
    $('main-panel').innerHTML = `<div class="form-heading"><div><h2>Ajouter les unités</h2><p>Chaque unité est rattachée à un lieu. Tu peux en ajouter plusieurs, y compris de types différents.</p></div></div>${renderProgress(3)}<div class="form-card"><div class="saved-subrecords"><h3>Unités déjà enregistrées <span>${units.length}</span></h3>${units.length ? units.map(r => `<div class="saved-row"><span class="round-icon green">⌂</span><div><strong>${esc(displayName('Unites', r))}</strong><small>${esc([formatValue(val('Unites', r, 'Type(s) de service')), relationName('Implantations', val('Unites', r, 'Implantation / lieu')), val('Unites', r, 'Étage(s)')].filter(Boolean).join(' · '))}</small></div></div>`).join('') : '<div class="notice">Aucune unité n’a encore été ajoutée.</div>'}</div>${locations.length ? `<form id="unit-form"><div class="form-section"><h3>Nouvelle unité</h3><div class="field-grid">
      ${textInput('unit-name', 'Nom de l’unité ou du service', '', true, 'Ex. SAJ, unité de vie…')}
      ${selectInput('unit-location', 'Lieu de rattachement', locationOpts, locationOpts[0]?.id || '', false)}
      ${field('Type(s) de service', `<div class="check-grid">${SERVICE_TYPES.map((t, i) => `<label class="check"><input type="checkbox" name="service-type" value="${esc(t)}" id="type-${i}"><span>${esc(t)}</span></label>`).join('')}</div>`, 'Coche un ou plusieurs types.', true)}
      ${field('Modalités d’accueil (facultatif)', `<div class="check-grid">${WELCOME_MODES.map((t, i) => `<label class="check"><input type="checkbox" name="welcome-mode" value="${esc(t)}" id="mode-${i}"><span>${esc(t)}</span></label>`).join('')}</div>`, '', true)}
      ${textInput('unit-building', 'Bâtiment (facultatif)', '', false, 'Ex. bâtiment B')}
      ${textInput('unit-floor', 'Étage (facultatif)', '', false, 'Ex. rez-de-chaussée, 1er étage')}
      ${fileInput('unit-photo', 'Photo ou logo de l’unité')}
      <div id="orientation-field" class="field wide hidden">${field('Orientations / notifications (foyers uniquement)', '<textarea id="unit-orientation" rows="3" placeholder="Saisis les orientations utiles, sans donnée concernant les personnes accompagnées."></textarea>', 'À compléter uniquement pour les foyers.')}</div>
    </div></div><div class="form-actions"><button class="button secondary" type="submit">＋ Enregistrer cette unité</button><button class="button primary" type="button" id="finish">Terminer</button><button class="button quiet" type="button" id="back-places">← Retour aux lieux</button></div></form>` : `<div class="notice">Aucun lieu n’est disponible. Reviens à l’étape précédente pour en ajouter un avant de créer une unité.</div><div class="form-actions"><button class="button quiet" id="back-places" type="button">← Retour aux lieux</button><button class="button primary" id="finish" type="button">Terminer sans ajouter d’unité</button></div>`}</div>`;
    const refreshOrientation = () => {
      const selected = Array.from(document.querySelectorAll('[name="service-type"]:checked')).map(x => x.value);
      $('orientation-field')?.classList.toggle('hidden', !selected.some(t => t.startsWith('Foyer')));
    };
    document.querySelectorAll('[name="service-type"]').forEach(input => input.onchange = refreshOrientation);
    if ($('unit-form')) $('unit-form').onsubmit = async event => { event.preventDefault(); await addUnit(); };
    $('finish').onclick = () => { state.selected = state.wizard.establishmentId; state.wizard.active = false; state.wizard.establishmentId = null; state.editor = null; setMessage('Fiche enregistrée. Tu peux la consulter et la modifier.'); render(); };
    $('back-places').onclick = () => { state.wizard.step = 2; render(); };
  }

  function formatValue(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }
  async function addUnit() {
    if (state.busy) return;
    state.busy = true; setMessage('Enregistrement de l’unité…');
    try {
      requiredColumn('Unites', 'Nom de l’unité / du service');
      requiredColumn('Unites', 'Établissement de rattachement');
      requiredColumn('Unites', 'Implantation / lieu');
      requiredColumn('Unites', 'Type(s) de service');
      const types = Array.from(document.querySelectorAll('[name="service-type"]:checked')).map(x => x.value);
      const modes = Array.from(document.querySelectorAll('[name="welcome-mode"]:checked')).map(x => x.value);
      if (!types.length) throw new Error('Choisis au moins un type de service pour cette unité.');
      const fields = {
        'Nom de l’unité / du service': $('unit-name').value.trim(),
        'Établissement de rattachement': Number(state.wizard.establishmentId),
        'Implantation / lieu': Number($('unit-location').value),
        'Type(s) de service': ['L', ...types],
        'Modalités d’accueil': ['L', ...modes],
        'Bâtiment': $('unit-building').value.trim() || null,
        'Étage(s)': $('unit-floor').value.trim() || null
      };
      const orientation = $('unit-orientation')?.value.trim();
      if (orientation) fields['Orientations / notifications (foyers uniquement)'] = orientation;
      const photoId = await uploadImage($('unit-photo')?.files?.[0]);
      if (photoId) fields['Photo ou logo de l’unité'] = ['L', photoId];
      const id = await createRecord('Unites', fields);
      state.wizard.units.push(id);
      await loadData();
      renderStepThree();
      setMessage('Unité enregistrée. Tu peux en ajouter une autre ou terminer.');
    } catch (error) { setMessage(error?.message || String(error), 'error'); }
    finally { state.busy = false; }
  }

  function renderCard() {
    const row = selectedEstablishment();
    if (!row) {
      $('main-panel').innerHTML = `<div class="welcome"><div class="welcome-mark">O</div><h2>Carte d’identité des établissements</h2><p>Crée une fiche, puis ajoute les lieux et les unités de l’établissement. Chaque étape est enregistrée dans Grist.</p><button class="button primary large" id="start-first">＋ Créer une fiche</button></div>`;
      $('start-first').onclick = startWizard;
      return;
    }
    const pole = relationName('Poles', val('Etablissements', row, 'Pôle de rattachement (facultatif)'));
    const establishmentPhotoId = attachmentIds(val('Etablissements', row, 'Photo de l’établissement'))[0];
    const linkedLocationIds = refList('Etablissements', row, 'Implantations / lieux (plusieurs possibles)');
    const locations = linkedLocationIds.map(id => byId('Implantations', id)).filter(Boolean);
    const units = rows('Unites').filter(u => Number(val('Unites', u, 'Établissement de rattachement')) === Number(row.id));
    const photoPromise = establishmentPhotoId ? attachmentUrl(establishmentPhotoId) : Promise.resolve(null);
    $('main-panel').innerHTML = `<div class="identity-card"><div class="identity-photo" id="identity-photo">⌂</div><div class="identity-main"><div class="saved-label"><i></i> Fiche enregistrée</div><h2>${esc(displayName('Etablissements', row))}</h2><div class="identity-meta">${pole ? `<span><b>Pôle</b>${esc(pole)}</span>` : ''}${val('Etablissements', row, 'Adresse e-mail administrative') ? `<span><b>Courriel administratif</b>${esc(val('Etablissements', row, 'Adresse e-mail administrative'))}</span>` : ''}${val('Etablissements', row, 'Téléphone administratif') ? `<span><b>Téléphone</b>${esc(val('Etablissements', row, 'Téléphone administratif'))}</span>` : ''}</div></div><div class="identity-actions"><button class="button secondary" id="edit-est">Modifier la fiche</button><button class="icon-button danger" id="delete-est" title="Supprimer cette fiche" aria-label="Supprimer">×</button></div></div>
      <section class="content-section"><div class="section-heading"><div><span class="section-icon orange">⌖</span><div><h3>Lieux associés</h3><p>${locations.length} lieu(x) enregistré(s)</p></div></div><button class="button secondary small" id="add-place">＋ Ajouter un lieu</button></div>${locations.length ? `<div class="location-grid">${locations.map(place => `<article class="location-card"><div class="location-symbol">⌖</div><div><strong>${esc(displayName('Implantations', place))}</strong><p>${esc([val('Implantations', place, 'Adresse'), val('Implantations', place, 'Code postal'), val('Implantations', place, 'Commune')].filter(Boolean).join(', ') || 'Adresse non renseignée')}</p></div><div class="related-actions"><button class="mini-edit" data-edit-place="${place.id}">Modifier</button><button class="mini-action" data-delete-place="${place.id}" title="Supprimer ce lieu" aria-label="Supprimer ce lieu">×</button></div></article>`).join('')}</div>` : '<div class="empty-inline">Aucun lieu enregistré pour le moment.</div>'}</section>
      <section class="content-section"><div class="section-heading"><div><span class="section-icon green">⌂</span><div><h3>Unités de l’établissement</h3><p>${units.length} unité(s) enregistrée(s)</p></div></div><button class="button secondary small" id="add-unit-card">＋ Ajouter une unité</button></div>${units.length ? `<div class="unit-grid">${units.map(unit => `<article class="unit-card"><div class="unit-symbol">●</div><div><strong>${esc(displayName('Unites', unit))}</strong><p>${esc([formatValue(val('Unites', unit, 'Type(s) de service')), relationName('Implantations', val('Unites', unit, 'Implantation / lieu')), val('Unites', unit, 'Étage(s)')].filter(Boolean).join(' · '))}</p></div><div class="related-actions"><button class="mini-edit" data-edit-unit="${unit.id}">Modifier</button><button class="mini-action" data-delete-unit="${unit.id}" title="Supprimer cette unité" aria-label="Supprimer cette unité">×</button></div></article>`).join('')}</div>` : '<div class="empty-inline">Aucune unité enregistrée pour le moment.</div>'}</section>
      <div class="association-note">La charte graphique est commune à l’association et ne se ressaisit pas sur chaque fiche.</div>`;
    photoPromise.then(url => { if (url && $('identity-photo')) $('identity-photo').innerHTML = `<img src="${esc(url)}" alt="Photo de l’établissement">`; });
    $('edit-est').onclick = () => { state.wizard = {active: true, step: 1, establishmentId: Number(row.id), locations: [], units: []}; renderStepOne(); };
    $('add-place').onclick = () => startWizardAt(2, row.id);
    $('add-unit-card').onclick = () => {
      const hasLocation = refList('Etablissements', row, 'Implantations / lieux (plusieurs possibles)').length > 0;
      startWizardAt(hasLocation ? 3 : 2, row.id);
    };
    $('delete-est').onclick = () => deleteEstablishment(row);
    document.querySelectorAll('[data-edit-place]').forEach(b => b.onclick = () => editRelated('Implantations', Number(b.dataset.editPlace)));
    document.querySelectorAll('[data-edit-unit]').forEach(b => b.onclick = () => editRelated('Unites', Number(b.dataset.editUnit)));
    document.querySelectorAll('[data-delete-place]').forEach(b => b.onclick = () => deleteLocation(Number(b.dataset.deletePlace), row.id));
    document.querySelectorAll('[data-delete-unit]').forEach(b => b.onclick = () => deleteUnit(Number(b.dataset.deleteUnit)));
  }

  function startWizardAt(step, establishmentId) {
    state.wizard = {active: true, step, establishmentId: Number(establishmentId), locations: [], units: []};
    render();
  }

  function editRelated(table, id) {
    const row = byId(table, id);
    if (!row) return;
    const dialog = $('edit-dialog');
    const isLocation = table === 'Implantations';
    const title = isLocation ? 'Modifier le lieu' : 'Modifier l’unité';
    let body = '';
    if (isLocation) {
      body = `<div class="field-grid">
        ${textInput('edit-name', 'Nom du lieu', val(table, row, 'Nom du lieu / site') || '', true)}
        ${selectInput('edit-type', 'Type de lieu', PLACE_TYPES, val(table, row, 'Type de lieu') || '')}
        ${textInput('edit-address', 'Adresse', val(table, row, 'Adresse') || '', true)}
        ${textInput('edit-complement', 'Complément d’adresse', val(table, row, 'Complément d’adresse') || '')}
        ${textInput('edit-postcode', 'Code postal', val(table, row, 'Code postal') || '', true)}
        ${textInput('edit-town', 'Commune', val(table, row, 'Commune') || '', true)}
        ${textInput('edit-department', 'Département', val(table, row, 'Département') || '')}
      </div>`;
    } else {
      const currentTypes = val(table, row, 'Type(s) de service');
      const typeSet = new Set(Array.isArray(currentTypes) ? currentTypes : currentTypes ? [currentTypes] : []);
      const currentModes = val(table, row, 'Modalités d’accueil');
      const modeSet = new Set(Array.isArray(currentModes) ? currentModes : currentModes ? [currentModes] : []);
      const locations = refList('Etablissements', selectedEstablishment(), 'Implantations / lieux (plusieurs possibles)')
        .map(placeId => byId('Implantations', placeId)).filter(Boolean).map(place => ({id: place.id, name: displayName('Implantations', place)}));
      body = `<div class="field-grid">
        ${textInput('edit-name', 'Nom de l’unité ou du service', val(table, row, 'Nom de l’unité / du service') || '', true)}
        ${selectInput('edit-location', 'Lieu de rattachement', locations, val(table, row, 'Implantation / lieu'), false)}
        ${field('Type(s) de service', `<div class="check-grid">${SERVICE_TYPES.map((t, i) => `<label class="check"><input type="checkbox" name="edit-service-type" value="${esc(t)}" ${typeSet.has(t) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`, '', true)}
        ${field('Modalités d’accueil (facultatif)', `<div class="check-grid">${WELCOME_MODES.map(t => `<label class="check"><input type="checkbox" name="edit-welcome-mode" value="${esc(t)}" ${modeSet.has(t) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`, '', true)}
        ${textInput('edit-building', 'Bâtiment (facultatif)', val(table, row, 'Bâtiment') || '')}
        ${textInput('edit-floor', 'Étage (facultatif)', val(table, row, 'Étage(s)') || '')}
        ${field('Orientations / notifications (foyers uniquement)', `<textarea id="edit-orientation" rows="3">${esc(val(table, row, 'Orientations / notifications (foyers uniquement)') || '')}</textarea>`, 'À utiliser uniquement pour les foyers.', true)}
      </div>`;
    }
    dialog.innerHTML = `<div class="dialog-head"><h2>${title}</h2><button type="button" class="icon-button" id="close-dialog" aria-label="Fermer">×</button></div><form id="edit-form" class="dialog-body">${body}<div class="dialog-actions"><button class="button primary" type="submit">Enregistrer les modifications</button><button class="button quiet" id="cancel-dialog" type="button">Annuler</button></div></form>`;
    const close = () => dialog.close();
    $('close-dialog').onclick = close;
    $('cancel-dialog').onclick = close;
    $('edit-form').onsubmit = async event => {
      event.preventDefault();
      try {
        let fields;
        if (isLocation) {
          fields = {
            'Nom du lieu / site': $('edit-name').value.trim(), 'Type de lieu': $('edit-type').value || null,
            'Adresse': $('edit-address').value.trim(), 'Complément d’adresse': $('edit-complement').value.trim() || null,
            'Code postal': $('edit-postcode').value.trim(), 'Commune': $('edit-town').value.trim(),
            'Département': $('edit-department').value.trim() || null
          };
        } else {
          fields = {
            'Nom de l’unité / du service': $('edit-name').value.trim(),
            'Implantation / lieu': Number($('edit-location').value),
            'Type(s) de service': ['L', ...Array.from(document.querySelectorAll('[name="edit-service-type"]:checked')).map(x => x.value)],
            'Modalités d’accueil': ['L', ...Array.from(document.querySelectorAll('[name="edit-welcome-mode"]:checked')).map(x => x.value)],
            'Bâtiment': $('edit-building').value.trim() || null, 'Étage(s)': $('edit-floor').value.trim() || null,
            'Orientations / notifications (foyers uniquement)': $('edit-orientation').value.trim() || null
          };
        }
        await updateRecord(table, id, fields);
        close(); await loadData(); setMessage('Modifications enregistrées.');
      } catch (error) { setMessage(error?.message || String(error), 'error'); }
    };
    dialog.showModal();
  }

  async function deleteEstablishment(row) {
    const id = Number(row.id);
    const hasUnits = rows('Unites').some(u => Number(val('Unites', u, 'Établissement de rattachement')) === id);
    const hasLocations = refList('Etablissements', row, 'Implantations / lieux (plusieurs possibles)').length > 0;
    const usedForPole = rows('Poles').some(p => Number(val('Poles', p, 'Établissement de rattachement administratif')) === id);
    if (hasUnits) { setMessage('Supprime ou rattache d’abord les unités de cet établissement.', 'error'); return; }
    if (hasLocations) { setMessage('Supprime d’abord les lieux associés à cet établissement.', 'error'); return; }
    if (usedForPole) { setMessage('Cet établissement est le point de rattachement administratif d’un pôle. Modifie ce rattachement avant de le supprimer.', 'error'); return; }
    if (!confirm(`Supprimer la fiche « ${displayName('Etablissements', row)} » ?`)) return;
    try { await grist.getTable('Etablissements').destroy(id); state.selected = null; await loadData(); setMessage('Fiche supprimée.'); }
    catch (error) { setMessage(error?.message || String(error), 'error'); }
  }
  async function deleteLocation(id, establishmentId) {
    if (rows('Unites').some(u => Number(val('Unites', u, 'Implantation / lieu')) === id)) {
      setMessage('Ce lieu est utilisé par une unité. Modifie ou supprime cette unité avant de supprimer le lieu.', 'error'); return;
    }
    const linkedElsewhere = rows('Etablissements').some(e => Number(e.id) !== Number(establishmentId) && refList('Etablissements', e, 'Implantations / lieux (plusieurs possibles)').includes(id));
    if (linkedElsewhere) { setMessage('Ce lieu est aussi rattaché à un autre établissement. Retire ce rattachement avant de le supprimer.', 'error'); return; }
    if (!confirm('Supprimer ce lieu ?')) return;
    try {
      const parent = byId('Etablissements', establishmentId);
      const ids = refList('Etablissements', parent, 'Implantations / lieux (plusieurs possibles)').filter(n => n !== id);
      await updateRecord('Etablissements', establishmentId, {'Implantations / lieux (plusieurs possibles)': ['r', 'Implantations', ids]});
      await grist.getTable('Implantations').destroy(id);
      await loadData(); setMessage('Lieu supprimé.');
    } catch (error) { setMessage(error?.message || String(error), 'error'); }
  }
  async function deleteUnit(id) {
    const row = byId('Unites', id);
    if (!row || !confirm(`Supprimer l’unité « ${displayName('Unites', row)} » ?`)) return;
    try { await grist.getTable('Unites').destroy(id); await loadData(); setMessage('Unité supprimée.'); }
    catch (error) { setMessage(error?.message || String(error), 'error'); }
  }

  function render() {
    renderList();
    if (state.wizard.active && state.wizard.step === 1) return renderStepOne();
    if (state.wizard.active && state.wizard.establishmentId && state.wizard.step === 2) return renderStepTwo();
    if (state.wizard.active && state.wizard.establishmentId && state.wizard.step === 3) return renderStepThree();
    return renderCard();
  }

  $('new-establishment').onclick = startWizard;
  $('edit-charter').onclick = openCharterEditor;
  $('search').oninput = event => { state.search = event.target.value; renderList(); };

  async function start() {
    try {
      if (!window.grist) throw new Error('L’API Grist ne s’est pas chargée. Ouvre cette page comme widget personnalisé dans Grist.');
      await grist.ready({requiredAccess: 'full'});
      await loadData();
    } catch (error) {
      setConnection('Connexion à vérifier', false);
      setMessage(`Impossible de se connecter à Grist. Vérifie l’adresse du widget et autorise son accès dans Grist.\n\nDétail : ${error?.message || error}`, 'error');
    }
  }
  start();
})();
