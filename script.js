(() => {
  'use strict';

  // Le widget utilise trois tables, importées depuis le classeur fourni.
  const TABLES = ['Association', 'Etablissements', 'Unites'];
  const FIELDS = {
    Association: ["Nom de l'association", "Logo de l'association", 'Couleur principale (HEX)', 'Couleur secondaire (HEX)', "Couleur d'accent (HEX)", 'Police (facultative)', 'Référence de la charte', 'Date de vérification'],
    Etablissements: ["Nom de l'établissement", 'Public de l’établissement', 'Adresse administrative', 'E-mail administratif', 'Téléphone administratif', "Logo ou photo de l’établissement"],
    Unites: ["Nom de l'unité / du service", 'Établissement de rattachement', 'Type de service', 'Précision du type (si autre)', 'Public accueilli par l’unité', 'Précisions sur le public', "Modalités d'accueil", 'Orientations / notifications (foyers uniquement)', "Photo ou logo de l'unité"]
  };
  // Les types Grist sont contrôlés au démarrage : le widget ne tente pas de
  // stocker une liste, une référence ou une pièce jointe dans une colonne Texte.
  const REQUIRED_TYPES = {
    Association: {"Logo de l'association":'Attachments','Date de vérification':'Date'},
    Etablissements: {'Public de l’établissement':'Choice',"Logo ou photo de l’établissement":'Attachments'},
    Unites: {'Établissement de rattachement':'Ref','Type de service':'Choice','Public accueilli par l’unité':'ChoiceList',"Modalités d'accueil":'ChoiceList','Orientations / notifications (foyers uniquement)':'ChoiceList',"Photo ou logo de l'unité":'Attachments'}
  };
  const SERVICES = [
    'SAJ — Service d’accueil de jour', 'SAJ M — SAJ médicalisé', 'Foyer de vie (FV)',
    'Foyer d’hébergement (FH)', 'EAM / AEM (ex-FAM)', 'Maison d’accueil spécialisée (MAS)',
    'ESAT', 'CAMSP', 'EAJE / crèche', 'IMP', 'IME', 'CEM', 'SESSAD', 'SAVS',
    'SAVS renforcé', 'SAVS à domicile', 'Service social', 'Autre / à préciser'
  ];
  const ESTABLISHMENT_PUBLICS = ['Petite enfance', 'Enfants / adolescents', 'Adultes'];
  const UNIT_PUBLICS = [
    {label:'Personnes avec un handicap moteur ou neuromoteur', description:'Difficultés de mouvement et de posture, avec des besoins d’aide variables. Les capacités intellectuelles peuvent être préservées.'},
    {label:'Personnes présentant une paralysie cérébrale', description:'Atteinte cérébrale précoce entraînant des troubles moteurs, avec ou sans troubles associés.'},
    {label:'Personnes polyhandicapées', description:'Association de déficiences motrices et intellectuelles sévères, entraînant une grande dépendance et des besoins d’accompagnement importants.'},
    {label:'Personnes cérébrolésées', description:'Séquelles d’un traumatisme crânien, d’un AVC ou d’une tumeur cérébrale, avec des conséquences motrices et/ou cognitives.'},
    {label:'Personnes présentant une maladie neurologique évolutive', description:'Notamment la sclérose en plaques, explicitement mentionnée par Odynéo.'},
    {label:'Autre public / à préciser', description:'À préciser dans le champ complémentaire.'}
  ];
  const MODALITIES = ['Accueil permanent','Accueil temporaire','Accueil de répit','Accueil de jour','Internat de semaine','Internat séquentiel','Semi-internat','Hébergement externalisé','Logement ou stage','Habitat groupé','Accompagnement à domicile','Vacances / répit','Intervention multisite','Autre / à préciser'];
  const FOYER_TYPES = ['Foyer de vie (FV)','Foyer d’hébergement (FH)'];
  const ORIENTATIONS = ['Orientation foyer de vie (FV)','Orientation foyer d’hébergement (FH)','Orientation EAM / AEM (ex-FAM)','Orientation MAS','Autre / à préciser'];
  const $ = id => document.getElementById(id);
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {tableIds:{}, columns:{}, columnTypes:{}, data:{}, page:'home', establishmentId:null, formType:null, editingId:null, saving:false, saveTimer:null, saveQueued:false, search:''};
  const rows = table => state.data[table] || [];
  const col = (table, label) => state.columns[table]?.[norm(label)] || null;

  function decode(value) {
    if (!Array.isArray(value)) return value;
    if (value[0] === 'R') return Number(value.length > 2 ? value[2] : value[1]) || null;
    if (value[0] === 'L') return value.slice(1);
    if (value[0] === 'E') return '';
    return value;
  }
  function get(table, row, label) {
    const key = col(table, label);
    return key && row ? decode(row[key]) : null;
  }
  function rowById(table, id) { return rows(table).find(row => Number(row.id) === Number(id)) || null; }
  function refId(table, row, label) { return Number(get(table, row, label)) || null; }
  function imageId(table, row, label) {
    const value = get(table, row, label);
    if (Array.isArray(value)) return Number(value.flat(Infinity).find(x => Number(x))) || null;
    return Number(value) || null;
  }
  function title(table, row) {
    const label = table === 'Etablissements' ? "Nom de l'établissement" : table === 'Unites' ? "Nom de l'unité / du service" : "Nom de l'association";
    return String(get(table,row,label) || 'Fiche sans nom');
  }
  function showMessage(text, kind='info') {
    const el = $('message'); el.textContent = text || ''; el.className = text ? 'message ' + kind : 'message hidden';
  }
  function setConnection(text, ok=true) { $('connection').textContent=text; $('connection').classList.toggle('offline',!ok); }

  async function loadColumns() {
    const [tables, columns] = await Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]);
    const tableRefById = {};
    (tables.tableId || []).forEach((id,i) => tableRefById[id] = Number(tables.id?.[i]));
    for (const name of TABLES) {
      const parent = tableRefById[state.tableIds[name]];
      state.columns[name] = {};
      state.columnTypes[name] = {};
      (columns.colId || []).forEach((id,i) => {
        if (Number(decode(columns.parentId?.[i])) === parent) {
          const label = columns.label?.[i];
          if (label) { state.columns[name][norm(label)] = id; state.columnTypes[name][norm(label)] = String(columns.type?.[i] || 'Any'); }
        }
      });
    }
  }
  async function loadData() {
    setConnection('Lecture des tables…');
    const available = await grist.docApi.listTables();
    const stripSuffix = id => String(id || '').toLowerCase().replace(/\d+$/,'');
    state.tableIds = {};
    for (const table of TABLES) {
      const matches = available.filter(id => stripSuffix(id) === stripSuffix(table));
      if (matches.length === 1) state.tableIds[table] = matches[0];
      else if (matches.length > 1) throw new Error('Plusieurs tables correspondent à « '+table+' » : '+matches.join(', ')+'. Supprime ou renomme les anciennes copies pour éviter d’enregistrer les fiches dans la mauvaise table.');
    }
    const missing = TABLES.filter(name => !state.tableIds[name]);
    if (missing.length) throw new Error('Tables absentes : ' + missing.join(', ') + '. Tables détectées : ' + (available.join(', ') || 'aucune') + '. Importe les trois onglets du classeur puis recharge le widget.');
    await loadColumns();
    for (const table of TABLES) {
      for (const label of FIELDS[table]) if (!col(table,label)) throw new Error('Colonne introuvable dans « ' + table + ' » : « ' + label + ' ». Vérifie l’intitulé de la colonne dans Grist.');
      for (const [label,expected] of Object.entries(REQUIRED_TYPES[table] || {})) {
        const actual=state.columnTypes[table]?.[norm(label)] || 'Any';
        const matches=expected==='Ref' ? (actual==='Ref' || actual.startsWith('Ref:')) : actual===expected;
        if(!matches) throw new Error('Type incorrect : dans la table « '+table+' », la colonne « '+label+' » est de type « '+actual+' », mais doit être de type Grist « '+expected+' ». Dans Grist, sélectionne la colonne, puis règle son type dans le panneau « Colonne ». Le classeur Excel ne peut pas définir ces types Grist à l’import.');
      }
      const raw = await grist.docApi.fetchTable(state.tableIds[table]);
      const keys = Object.keys(raw).filter(key => key !== 'id');
      state.data[table] = (raw.id || []).map((id,i) => { const row={id:Number(id)}; for (const key of keys) row[key]=raw[key]?.[i]; return row; });
    }
    await applyBrand();
    setConnection('Connecté à Grist');
  }
  function validHex(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '').trim()); }
  async function attachmentUrl(id) {
    try { const t=await grist.docApi.getAccessToken({readOnly:true}); return t.baseUrl+'/attachments/'+Number(id)+'/download?auth='+encodeURIComponent(t.token); }
    catch (_) { return ''; }
  }
  async function applyBrand() {
    const row=rows('Association')[0];
    const colors=[['Couleur principale (HEX)','--primary','#173D64'],['Couleur secondaire (HEX)','--secondary','#DE8436'],["Couleur d'accent (HEX)",'--accent','#A9C442']];
    for (const [label,css,fallback] of colors) { const v=get('Association',row,label); document.documentElement.style.setProperty(css,validHex(v)?String(v).trim():fallback); }
    const font=String(get('Association',row,'Police (facultative)')||'Arial').trim();
    document.documentElement.style.setProperty('--font-family',['Arial','Helvetica','Aptos','Verdana','Tahoma'].includes(font)?font+', sans-serif':'Arial, sans-serif');
    const brand=$('brand'); brand.textContent='O';
    const id=imageId('Association',row,"Logo de l'association");
    if (id) { const url=await attachmentUrl(id); if(url) brand.innerHTML='<img src="'+esc(url)+'" alt="Logo Odynéo">'; }
  }
  async function hydrateImages(root=document) {
    for(const img of root.querySelectorAll('img[data-attachment]')) { const url=await attachmentUrl(img.dataset.attachment); if(url) img.src=url; }
  }

  function payload(table, values) {
    const out={};
    for(const [label,value] of Object.entries(values)) {
      const id=col(table,label);
      if(!id) throw new Error('Enregistrement annulé : colonne « '+label+' » absente de « '+table+' ».');
      out[id]=value;
    }
    if(!Object.keys(out).length) throw new Error('Aucune donnée ne peut être envoyée à Grist.');
    return out;
  }
  async function fetchRows(table) {
    const raw=await grist.docApi.fetchTable(state.tableIds[table]);
    return (raw.id||[]).map((id,i)=>{ const row={id:Number(id)}; for(const k of Object.keys(raw)) if(k!=='id') row[k]=raw[k]?.[i]; return row; });
  }
  function normalizedValue(value) {
    const decoded=decode(value);
    if(Array.isArray(decoded)) return decoded.map(v=>String(v)).sort();
    if(decoded===null || decoded===undefined) return '';
    return String(decoded).trim();
  }
  async function verifyRow(table,id,values) {
    const found=(await fetchRows(table)).find(r=>Number(r.id)===Number(id));
    if(!found) throw new Error('La ligne a été envoyée, mais Grist ne la retrouve pas après relecture. Vérifie les autorisations du widget.');
    const failures=[];
    for(const [label,want] of Object.entries(values)) {
      const actual=get(table,found,label);
      if(JSON.stringify(normalizedValue(actual))!==JSON.stringify(normalizedValue(want))) failures.push(label);
    }
    if(failures.length) throw new Error('Grist n’a pas confirmé ces champs : '+failures.join(', ')+'. Vérifie les types de colonnes et l’accès complet du widget.');
    return found;
  }
  async function writeRow(table,id,values) {
    const mapped=payload(table,values);
    let savedId=Number(id)||null;
    if(savedId) await grist.getTable(state.tableIds[table]).update({id:savedId,...mapped});
    else {
      const result=await grist.getTable(state.tableIds[table]).create(mapped);
      const first=Array.isArray(result)?result[0]:result;
      savedId=Number(first?.id ?? first);
      if(!savedId) throw new Error('Grist n’a pas renvoyé l’identifiant de la nouvelle fiche.');
    }
    // Conserver l’identifiant immédiatement : une erreur de vérification ne doit
    // jamais transformer l’enregistrement suivant en création d’un doublon.
    state.editingId=savedId;
    if(table==='Etablissements') state.establishmentId=savedId;
    await verifyRow(table,savedId,values);
    await loadData();
    return savedId;
  }
  async function deleteRow(table,id) {
    await grist.getTable(state.tableIds[table]).destroy(Number(id));
    const left=(await fetchRows(table)).some(row=>Number(row.id)===Number(id));
    if(left) throw new Error('La suppression n’a pas été confirmée par Grist.');
    await loadData();
  }

  function textField(id,label,value='',opts={}) {
    const wide=opts.wide?' wide':''; const star=opts.required?' <span class="required">*</span>':'';
    const control=opts.area?'<textarea id="'+id+'" '+(opts.required?'required':'')+' placeholder="'+esc(opts.placeholder||'')+'">'+esc(value)+'</textarea>':'<input id="'+id+'" type="'+(opts.type||'text')+'" value="'+esc(value)+'" '+(opts.required?'required':'')+' placeholder="'+esc(opts.placeholder||'')+'">';
    return '<div class="field'+wide+'"><label for="'+id+'">'+esc(label)+star+'</label>'+control+(opts.help?'<small class="field-help">'+esc(opts.help)+'</small>':'')+'</div>';
  }
  function selectField(id,label,options,selected='',required=false,help='') {
    return '<div class="field"><label for="'+id+'">'+esc(label)+(required?' <span class="required">*</span>':'')+'</label><select id="'+id+'" '+(required?'required':'')+'><option value="">Choisir…</option>'+options.map(x=>'<option '+(x===selected?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>'+(help?'<small class="field-help">'+esc(help)+'</small>':'')+'</div>';
  }
  function multiField(id,label,options,selected=[],help='') {
    const chosen=new Set(Array.isArray(selected)?selected:[]);
    const checks=options.map(item=>{const o=typeof item==='string'?{label:item,description:''}:item;return '<label class="check-option"><input type="checkbox" name="'+id+'" value="'+esc(o.label)+'" '+(chosen.has(o.label)?'checked':'')+'><span><strong>'+esc(o.label)+'</strong>'+(o.description?'<small>'+esc(o.description)+'</small>':'')+'</span></label>';}).join('');
    return '<div class="field wide"><label>'+esc(label)+' <span class="field-help">(plusieurs choix possibles)</span></label><details class="multi-box"><summary>Choisir les publics ou modalités</summary><div class="check-list">'+checks+'</div></details>'+(help?'<small class="field-help">'+esc(help)+'</small>':'')+'</div>';
  }
  function photoField(id,label,oldId) {
    return '<div class="field wide"><label for="'+id+'">'+esc(label)+' <span class="field-help">(facultatif)</span></label><input id="'+id+'" type="file" accept="image/png,image/jpeg,image/webp"><div class="image-preview" id="'+id+'-preview">'+(oldId?'<img data-attachment="'+Number(oldId)+'" alt="Image actuelle"><label class="remove-image"><input id="'+id+'-remove" type="checkbox"> Retirer l’image actuelle</label>':'')+'</div><small class="field-help">Image PNG, JPG ou WebP · 5 Mo maximum.</small></div>';
  }
  function imageMarkup(id,alt,placeholder='◉') { return id?'<img data-attachment="'+Number(id)+'" alt="'+esc(alt)+'">':esc(placeholder); }
  function linkUnits(estId) { return rows('Unites').filter(r=>refId('Unites',r,'Établissement de rattachement')===Number(estId)); }
  function displayPublicList(value) {
    const v=Array.isArray(value)?value:(value?String(value).split(',').map(x=>x.trim()):[]);
    return v.join(' · ');
  }
  function renderHome() {
    state.page='home'; state.establishmentId=null; state.formType=null; state.editingId=null;
    $('page-title').textContent='Carte d’identité des établissements';
    $('page-subtitle').textContent='Crée une fiche établissement, puis ajoute ses services et unités.';
    const filtered=rows('Etablissements').filter(r=>title('Etablissements',r).toLowerCase().includes(state.search.toLowerCase()));
    $('main-panel').innerHTML='<div class="toolbar"><div><h2>Établissements <span class="count-badge">'+rows('Etablissements').length+'</span></h2><p class="muted">Chaque établissement est renseigné une fois.</p></div><div class="toolbar-actions"><input class="search" id="search" placeholder="Rechercher un établissement…" value="'+esc(state.search)+'"><button class="button primary" id="add-establishment">+ Ajouter un établissement</button></div></div><div class="establishment-list">'+(filtered.length?filtered.map(r=>'<button class="establishment-tile" data-open="'+Number(r.id)+'"><span class="tile-logo">'+imageMarkup(imageId('Etablissements',r,"Logo ou photo de l’établissement"),title('Etablissements',r))+'</span><span><strong>'+esc(title('Etablissements',r))+'</strong><small>'+esc(get('Etablissements',r,'Public de l’établissement')||'Public non renseigné')+' · '+linkUnits(r.id).length+' service(s) / unité(s)</small></span><span class="tile-arrow">›</span></button>').join(''):'<div class="record-empty">Aucun établissement. Clique sur « Ajouter un établissement » pour créer la première fiche.</div>')+'</div>';
    $('add-establishment').onclick=()=>openForm('establishment');
    $('search').oninput=e=>{state.search=e.target.value;const pos=e.target.selectionStart;renderHome();$('search').focus();$('search').setSelectionRange(pos,pos);};
    $('main-panel').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openDetail(Number(b.dataset.open)));
    hydrateImages($('main-panel'));
  }
  function openDetail(id) { state.establishmentId=Number(id); state.page='detail'; renderDetail(); }
  function renderDetail() {
    const est=rowById('Etablissements',state.establishmentId); if(!est)return renderHome();
    state.page='detail'; state.formType=null; state.editingId=null;
    $('page-title').textContent='Fiche établissement'; $('page-subtitle').textContent='Les renseignements de l’établissement sont saisis une seule fois.';
    const logo=imageId('Etablissements',est,"Logo ou photo de l’établissement");
    const units=linkUnits(est.id);
    $('main-panel').innerHTML='<button class="back-link" id="back-home">← Tous les établissements</button><section class="identity-card"><div class="identity-photo">'+imageMarkup(logo,title('Etablissements',est),'⌂')+'</div><div class="identity-content"><h2>'+esc(title('Etablissements',est))+'</h2><div class="identity-meta"><span><b>Public :</b> '+esc(get('Etablissements',est,'Public de l’établissement')||'Non renseigné')+'</span><span><b>Adresse :</b> '+esc(get('Etablissements',est,'Adresse administrative')||'Non renseignée')+'</span><span><b>E-mail :</b> '+esc(get('Etablissements',est,'E-mail administratif')||'Non renseigné')+'</span><span><b>Téléphone :</b> '+esc(get('Etablissements',est,'Téléphone administratif')||'Non renseigné')+'</span></div></div><div class="identity-actions"><button class="button secondary" id="edit-establishment">Modifier</button><button class="button danger" id="delete-establishment">Supprimer</button></div></section><section class="section"><div class="section-heading"><div class="section-heading-copy"><h3>Services et unités <span class="count-badge">'+units.length+'</span></h3><p>Ajoute plusieurs SAJ, SAJ M, foyers, unités ou services à cet établissement.</p></div><button class="button primary" id="add-unit">+ Ajouter un service / une unité</button></div><div class="record-list">'+(units.length?units.map(u=>'<article class="record-card"><span class="record-image">'+imageMarkup(imageId('Unites',u,"Photo ou logo de l'unité"),title('Unites',u))+'</span><span class="record-copy"><strong>'+esc(title('Unites',u))+'</strong><p class="type-line">'+esc(get('Unites',u,'Type de service')||'Type non renseigné')+'</p><p>Public : '+esc(displayPublicList(get('Unites',u,'Public accueilli par l’unité'))||'Non renseigné')+'</p></span><span class="record-actions"><button class="icon-button" data-edit="'+Number(u.id)+'">Modifier</button><button class="icon-button delete" data-delete="'+Number(u.id)+'">Supprimer</button></span></article>').join(''):'<div class="record-empty">Aucun service ou unité pour le moment. Tu peux en ajouter autant que nécessaire.</div>')+'</div></section>';
    $('back-home').onclick=renderHome;
    $('edit-establishment').onclick=()=>openForm('establishment',Number(est.id));
    $('delete-establishment').onclick=()=>removeEstablishment(Number(est.id));
    $('add-unit').onclick=()=>openForm('unit');
    $('main-panel').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openForm('unit',Number(b.dataset.edit)));
    $('main-panel').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeUnit(Number(b.dataset.delete)));
    hydrateImages($('main-panel'));
  }
  function openForm(type,id=null) { state.page='form';state.formType=type;state.editingId=id;renderForm(); }
  function rowForForm() { return state.editingId?rowById(state.formType==='establishment'?'Etablissements':'Unites',state.editingId):null; }
  function renderForm() {
    const type=state.formType, existing=rowForForm(), edit=Boolean(existing);
    if(type==='unit'&&!state.establishmentId)return renderHome();
    $('page-title').textContent=type==='establishment'?'Fiche établissement':'Fiche service / unité';
    $('page-subtitle').textContent=edit?'Modifie les renseignements de cette fiche.':'Les changements sont enregistrés dans Grist au fur et à mesure.';
    let fields='';
    if(type==='establishment') {
      fields='<h3 class="form-section-title">Identification</h3>'+textField('name',"Nom de l’établissement",get('Etablissements',existing,"Nom de l'établissement")||'',{required:true,wide:true,placeholder:'Ex. SESSAD Odynéo Lyon'})+selectField('audience','Public de l’établissement',ESTABLISHMENT_PUBLICS,get('Etablissements',existing,'Public de l’établissement')||'',true,'Choisis une seule catégorie. Un établissement ne peut pas accueillir à la fois des enfants et des adultes.')+'<h3 class="form-section-title">Coordonnées administratives</h3>'+textField('address','Adresse administrative',get('Etablissements',existing,'Adresse administrative')||'',{wide:true,area:true,placeholder:'Numéro, rue, code postal et commune'})+textField('email','E-mail administratif',get('Etablissements',existing,'E-mail administratif')||'',{type:'email',placeholder:'contact@exemple.fr'})+textField('phone','Téléphone administratif',get('Etablissements',existing,'Téléphone administratif')||'',{type:'tel',placeholder:'04…'})+photoField('photo',"Logo ou photo de l’établissement",imageId('Etablissements',existing,"Logo ou photo de l’établissement"));
    } else {
      const typeValue=get('Unites',existing,'Type de service')||'';
      fields='<h3 class="form-section-title">Identification du service ou de l’unité</h3>'+textField('name',"Nom du service ou de l’unité",get('Unites',existing,"Nom de l'unité / du service")||'',{required:true,wide:true,placeholder:'Ex. SAJ Les Alizés'})+selectField('service-type','Type de service',SERVICES,typeValue,true)+textField('other-type','Précision si « Autre »',get('Unites',existing,'Précision du type (si autre)')||'',{placeholder:'Précise le type de service'})+'<h3 class="form-section-title">Public et accueil</h3>'+multiField('publics','Public accueilli par l’unité',UNIT_PUBLICS,get('Unites',existing,'Public accueilli par l’unité')||[],'Plusieurs publics peuvent être sélectionnés.')+textField('public-details','Précisions sur le public',get('Unites',existing,'Précisions sur le public')||'',{wide:true,area:true,placeholder:'Précisions utiles, notamment pour « Autre public »'})+multiField('modalities',"Modalités d’accueil",MODALITIES,get('Unites',existing,"Modalités d'accueil")||[])+('<div id="foyer-wrap" class="'+(FOYER_TYPES.includes(typeValue)?'':'hidden')+'">'+multiField('orientations','Orientations / notifications (foyers uniquement)',ORIENTATIONS,get('Unites',existing,'Orientations / notifications (foyers uniquement)')||[])+'</div>')+photoField('photo',"Photo ou logo de l’unité",imageId('Unites',existing,"Photo ou logo de l'unité"));
    }
    $('main-panel').innerHTML='<button class="back-link" id="cancel-form">← Retour à la fiche</button><div class="form-wrap"><div class="form-head"><h2>'+(edit?'Modifier la fiche':'Créer une fiche')+'</h2><p>'+(type==='unit'?'Établissement : '+esc(title('Etablissements',rowById('Etablissements',state.establishmentId))):'Les champs marqués d’une étoile sont obligatoires.')+'</p></div><form id="record-form" class="form-card" novalidate><div class="field-grid">'+fields+'</div><p class="hint-box">Les changements sont enregistrés automatiquement dans Grist dès que les champs obligatoires sont remplis. Les photos sont facultatives.</p><p id="autosave-status" class="autosave-status" aria-live="polite">Enregistrement automatique prêt.</p><div class="form-actions"><button id="save-button" type="submit" class="button primary">'+(edit?'Enregistrer les modifications':'Terminer et afficher la fiche')+'</button></div></form></div>';
    $('cancel-form').onclick=()=>{clearTimeout(state.saveTimer);state.page=type==='establishment'&&!state.establishmentId?'home':'detail';state.formType=null;state.editingId=null;render();};
    $('record-form').onsubmit=saveForm;
    if(type==='unit')$('service-type').onchange=()=>{$('foyer-wrap').classList.toggle('hidden',!FOYER_TYPES.includes($('service-type').value));scheduleAutosave();};
    $('record-form').addEventListener('input',scheduleAutosave);
    $('record-form').addEventListener('change',event=>{if(event.target.type==='file')previewPhoto(event.target);scheduleAutosave();});
    hydrateImages($('main-panel'));
  }
  function previewPhoto(input) {
    const file=input.files?.[0]; if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)){input.value='';showMessage('Choisis une image PNG, JPG ou WebP.','error');return;}
    if(file.size>5*1024*1024){input.value='';showMessage('L’image doit peser 5 Mo maximum.','error');return;}
    const preview=$(input.id+'-preview'); let img=preview.querySelector('img'); if(!img){img=document.createElement('img');preview.prepend(img);} img.src=URL.createObjectURL(file);img.alt='Aperçu de la photo';
    const remove=$(input.id+'-remove');if(remove)remove.checked=false;
  }
  function selected(name) { return [...document.querySelectorAll('input[name="'+name+'"]:checked')].map(x=>x.value); }
  function readForm() {
    if(state.formType==='establishment') return {
      "Nom de l'établissement":$('name').value.trim(), 'Public de l’établissement':$('audience').value,
      'Adresse administrative':$('address').value.trim(), 'E-mail administratif':$('email').value.trim(), 'Téléphone administratif':$('phone').value.trim()
    };
    return {
      "Nom de l'unité / du service":$('name').value.trim(), 'Établissement de rattachement':Number(state.establishmentId),
      'Type de service':$('service-type').value, 'Précision du type (si autre)':$('other-type').value.trim(),
      'Public accueilli par l’unité':['L',...selected('publics')], 'Précisions sur le public':$('public-details').value.trim(),
      "Modalités d'accueil":['L',...selected('modalities')],
      'Orientations / notifications (foyers uniquement)':FOYER_TYPES.includes($('service-type').value)?['L',...selected('orientations')]:['L']
    };
  }
  function requiredReady(v) { return state.formType==='establishment'?Boolean(v["Nom de l'établissement"]&&v['Public de l’établissement']):Boolean(v["Nom de l'unité / du service"]&&v['Type de service']); }
  function autoStatus(text,kind='') { const el=$('autosave-status');if(el){el.textContent=text;el.className='autosave-status'+(kind?' '+kind:'');} }
  function scheduleAutosave() {
    if(state.page!=='form')return;
    clearTimeout(state.saveTimer);
    const values=readForm();
    if(!requiredReady(values)){autoStatus('Renseigne les champs obligatoires pour commencer l’enregistrement automatique.');return;}
    autoStatus('Enregistrement en attente…');state.saveTimer=setTimeout(runAutosave,650);
  }
  async function uploadImage(file) {
    const token=await grist.docApi.getAccessToken({readOnly:false});const body=new FormData();body.append('upload',file,file.name);
    const res=await fetch(token.baseUrl+'/attachments?auth='+encodeURIComponent(token.token),{method:'POST',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},body});
    if(!res.ok)throw new Error('Échec du téléversement de la photo (HTTP '+res.status+').');
    const result=await res.json();const id=Array.isArray(result)?result[0]:(result.id??result.attachmentId??result);
    if(!Number(id))throw new Error('Grist n’a pas confirmé l’enregistrement de la photo.');return Number(id);
  }
  async function persistForm() {
    const table=state.formType==='establishment'?'Etablissements':'Unites';const values=readForm();
    const photoLabel=state.formType==='establishment'?"Logo ou photo de l’établissement":"Photo ou logo de l'unité";
    const existing=state.editingId?rowById(table,state.editingId):null;const old=imageId(table,existing,photoLabel);
    const remove=$('photo-remove')?.checked;const file=$('photo')?.files?.[0];
    const imgId=file?await uploadImage(file):(remove?null:old);
    if(imgId) {
      values[photoLabel]=['L',imgId];
    } else if(remove) {
      values[photoLabel]=['L'];
    } else {
      // Champ photo facultatif : ne pas écrire ni vérifier une liste vide,
      // dont Grist ne renvoie pas toujours la même représentation.
      delete values[photoLabel];
    }
    const id=await writeRow(table,state.editingId,values);state.editingId=id;
    if(file) $('photo').value='';
    if(table==='Etablissements')state.establishmentId=id;
    return id;
  }
  async function runAutosave() {
    state.saveTimer=null;if(state.saving){state.saveQueued=true;return;}if(state.page!=='form')return;
    const values=readForm();if(!requiredReady(values))return;
    state.saving=true;const button=$('save-button');if(button)button.disabled=true;autoStatus('Enregistrement et vérification dans Grist…');
    try { await persistForm();autoStatus('Enregistré et vérifié dans Grist. Tu peux continuer à modifier les champs.','saved'); }
    catch(error){autoStatus('Échec : '+(error.message||String(error)),'failed');showMessage(error.message||String(error),'error');}
    finally {state.saving=false;if(button)button.disabled=false;if(state.saveQueued){state.saveQueued=false;state.saveTimer=setTimeout(runAutosave,100);}}
  }
  async function saveForm(event) {
    event.preventDefault();clearTimeout(state.saveTimer);
    if(state.saving){autoStatus('Un enregistrement est déjà en cours. Attends sa confirmation.');return;}
    if(!$('record-form').reportValidity())return;
    const values=readForm();if(!requiredReady(values)){autoStatus('Complète les champs obligatoires.','failed');return;}
    state.saving=true;const button=$('save-button');button.disabled=true;button.textContent='Enregistrement…';
    try {
      await persistForm();const type=state.formType;state.formType=null;state.editingId=null;state.page='detail';renderDetail();showMessage('Fiche enregistrée et vérifiée dans Grist.','success');
    } catch(error) {autoStatus('Échec : '+(error.message||String(error)),'failed');showMessage(error.message||String(error),'error');button.disabled=false;button.textContent='Réessayer';}
    finally {state.saving=false;}
  }
  async function removeUnit(id) {
    const row=rowById('Unites',id);if(!row||!confirm('Supprimer « '+title('Unites',row)+' » ?'))return;
    try{await deleteRow('Unites',id);renderDetail();showMessage('Service ou unité supprimé.','success');}catch(e){showMessage(e.message||String(e),'error');}
  }
  async function removeEstablishment(id) {
    const est=rowById('Etablissements',id);if(!est)return;const children=linkUnits(id);
    if(!confirm('Supprimer l’établissement « '+title('Etablissements',est)+' » et ses '+children.length+' service(s) / unité(s) ? Cette action est définitive.'))return;
    try{for(const child of children)await grist.getTable(state.tableIds.Unites).destroy(Number(child.id));await grist.getTable(state.tableIds.Etablissements).destroy(Number(id));await loadData();if(rowById('Etablissements',id)||children.some(child=>rowById('Unites',child.id)))throw new Error('Grist n’a pas confirmé la suppression de toutes les fiches liées.');renderHome();showMessage('Établissement et fiches associées supprimés.','success');}
    catch(e){showMessage('La suppression n’a pas pu être terminée : '+(e.message||String(e)),'error');}
  }
  async function start() {
    try {if(typeof grist==='undefined')throw new Error('Ouvre cette page depuis la vue « Widget personnalisé » de Grist.');await loadData();renderHome();}
    catch(error){setConnection('À vérifier',false);$('main-panel').innerHTML='<div class="panel empty-state"><div class="empty-icon">!</div><h3>Le widget ne peut pas lire les tables</h3><p>'+esc(error.message||String(error))+'</p><p>Dans les paramètres de la vue, sélectionne « Accès complet au document », puis recharge le widget.</p></div>';}
  }
  if(typeof grist!=='undefined' && typeof grist.ready==='function') grist.ready({requiredAccess:'full'});
  start();
})();
