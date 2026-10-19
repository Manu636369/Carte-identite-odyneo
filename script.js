(() => {
  'use strict';

  const TABLES = ['Association', 'Poles', 'Etablissements', 'Implantations', 'Unites'];
  const FIELDS = {
    Association: ["Nom de l'association", "Logo de l'association", "Couleur principale (HEX)", "Couleur secondaire (HEX)", "Couleur d'accent (HEX)"],
    Poles: ['Nom du pôle', 'Établissement administratif', 'Logo du pôle'],
    Etablissements: ["Nom de l'établissement", 'Public de l’établissement', 'Pôle de rattachement (facultatif)', "Logo ou photo de l’établissement", 'Adresse administrative'],
    Implantations: ['Établissement de rattachement', 'Nom du lieu', 'Adresse complète', 'Étage(s)', 'Photo du lieu'],
    Unites: ["Nom de l'unité", 'Type de service', 'Précision du type (si autre)', 'Public accueilli par l’unité', 'Précisions sur le public', 'Lieu', 'Étage', "Modalités d'accueil", 'Orientations / notifications (foyers uniquement)', "Photo ou logo de l'unité", 'Établissement de rattachement (facultatif)', 'Pôle de rattachement (facultatif)']
  };
  const SERVICE_TYPES = [
    'Foyer de vie (FV)', 'Foyer d’hébergement (FH)',
    'Établissement d’accueil médicalisé (EAM / AEM, ex-FAM)',
    'Maison d’accueil spécialisée (MAS)', 'Service d’accueil de jour (SAJ)',
    'SAJ médicalisé (SAJM / SAJ M)', 'CAMSP', 'EAJE / crèche', 'IMP', 'IME', 'CEM',
    'SESSAD', 'ESAT', 'SAVS', 'SAVS renforcé', 'SAVS à domicile',
    'Service social central', 'Siège / direction', 'Action associative',
    'Odynéo Formation', 'Village Répit Familles (VRF) / partenariat', 'Autre / à préciser'
  ];
  const MODALITIES = [
    'Accueil permanent', 'Accueil temporaire', 'Accueil de répit', 'Accueil de jour',
    'Internat de semaine', 'Internat séquentiel', 'Semi-internat',
    'Hébergement externalisé', 'Logement ou stage', 'Habitat groupé',
    'Accompagnement à domicile', 'Vacances / répit', 'Intervention multisite',
    'Autre / à préciser'
  ];
  const FOYER_NOTIFICATIONS = [
    'Orientation foyer de vie (FV)', 'Orientation foyer d’hébergement (FH)',
    'Orientation EAM (ex-FAM)', 'Orientation MAS', 'Autre / à préciser'
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
  const $ = id => document.getElementById(id);
  const state = {data:{}, columns:{}, page:'home', wizard:{step:1, establishmentId:null, poleId:null, editing:false, returnPage:'home'}, search:'', busy:false};
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unwrap = v => {
    if (!Array.isArray(v)) return v;
    if (v[0] === 'R') return Number(v.length >= 3 ? v[2] : v[1]) || null;
    if (v[0] === 'r') { const x=v.length>=3?v[2]:v[1]; return Array.isArray(x)?x.map(Number).filter(Boolean):[]; }
    if (v[0] === 'L') return v.slice(1);
    if (v[0] === 'E') return '';
    return v;
  };
  const rows = t => state.data[t] || [];
  const col = (t,label) => state.columns[t]?.[norm(label)] || null;
  const val = (t,row,label) => {const key=col(t,label); return key && row ? unwrap(row[key]) : null;};
  const byId = (t,id) => rows(t).find(r => Number(r.id)===Number(id));
  const name = (t,r) => String(val(t,r, FIELDS[t][t==='Association'?0: t==='Poles'?0:t==='Etablissements'?0:t==='Implantations'?1:0]) || 'Fiche sans nom');
  const showMessage = (text,kind='info') => {const e=$('message');e.textContent=text||'';e.className='message'+(text?' '+kind:' hidden');};
  const setConnection = (text,ok=true) => {const e=$('connection');e.textContent=text;e.classList.toggle('offline',!ok);};
  function readRelation(table,row,label){return Number(val(table,row,label))||null;}
  function recordTitle(table,row){
    const title={Association:"Nom de l'association",Poles:'Nom du pôle',Etablissements:"Nom de l'établissement",Implantations:'Nom du lieu',Unites:"Nom de l'unité"}[table];
    return String(val(table,row,title)||'Fiche sans nom');
  }
  async function loadColumns(){
    const [tablesMeta,columnsMeta]=await Promise.all([grist.docApi.fetchTable('_grist_Tables'),grist.docApi.fetchTable('_grist_Tables_column')]);
    const refs={};(tablesMeta.tableId||[]).forEach((id,i)=>refs[id]=Number(tablesMeta.id?.[i]));
    state.columns={};
    for(const t of TABLES){
      const ref=refs[t];state.columns[t]={};if(!ref)continue;
      (columnsMeta.colId||[]).forEach((id,i)=>{if(Number(unwrap(columnsMeta.parentId?.[i]))===ref){const label=columnsMeta.label?.[i];if(label)state.columns[t][norm(label)]=id;}});
    }
  }
  async function loadData(){
    setConnection('Lecture de Grist…');
    const available=await grist.docApi.listTables();
    const missing=TABLES.filter(t=>!available.includes(t));
    if(missing.length)throw new Error('Tables manquantes : '+missing.join(', ')+'. Importe le classeur des tables puis recharge le widget.');
    await loadColumns();
    for(const t of TABLES){
      const raw=await grist.docApi.fetchTable(t),keys=Object.keys(raw).filter(k=>k!=='id');
      state.data[t]=(raw.id||[]).map((id,i)=>{const r={id};for(const k of keys)r[k]=raw[k]?.[i];return r;});
    }
    for(const [t,fields] of Object.entries(FIELDS))for(const f of fields)if(!col(t,f))throw new Error('Colonne manquante : « '+f+' » dans la table « '+t+' ». Les noms doivent correspondre au classeur fourni.');
    applyTheme();setConnection('Connecté à Grist');render();
  }
  function applyTheme(){
    const a=rows('Association')[0];
    const color=(label,fallback)=>{const c=val('Association',a,label);return /^#[\da-f]{6}$/i.test(String(c||''))?c:fallback;};
    document.documentElement.style.setProperty('--blue',color('Couleur principale (HEX)','#173d64'));
    document.documentElement.style.setProperty('--orange',color('Couleur secondaire (HEX)','#de8436'));
    document.documentElement.style.setProperty('--green',color("Couleur d'accent (HEX)",'#a9c442'));
    const brand=$('brand');const id=attachmentIds(val('Association',a,"Logo de l'association"))[0];
    if(id) attachmentUrl(id).then(url=>{if(url)brand.innerHTML='<img src="'+esc(url)+'" alt="Logo de l’association">';});
  }
  function attachmentIds(value){const x=unwrap(value);if(Array.isArray(x))return x.flat(Infinity).map(Number).filter(n=>n>0);const n=Number(x);return n>0?[n]:[];}
  async function attachmentUrl(id){
    try{const t=await grist.docApi.getAccessToken({readOnly:true});return t.baseUrl+'/attachments/'+id+'/download?auth='+encodeURIComponent(t.token);}catch(_){return null;}
  }
  async function uploadImage(file){
    if(!file)return null;
    if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Choisis une image PNG, JPG ou WebP.');
    if(file.size>5*1024*1024)throw new Error('L’image doit faire 5 Mo maximum.');
    const t=await grist.docApi.getAccessToken({readOnly:false}),data=new FormData();data.append('upload',file,file.name);
    const res=await fetch(t.baseUrl+'/attachments?auth='+encodeURIComponent(t.token),{method:'POST',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json'},body:data});
    if(!res.ok)throw new Error('Grist n’a pas pu enregistrer la photo (erreur '+res.status+').');
    const body=await res.json(),id=Array.isArray(body)?body[0]:(body.id??body.attachmentId??body);
    if(!Number(id))throw new Error('Grist n’a pas renvoyé l’identifiant de la photo.');return Number(id);
  }
  function payload(table,fields){const p={};for(const [label,value] of Object.entries(fields)){const k=col(table,label);if(k)p[k]=value;}return p;}
  async function createRow(table,fields){
    const r=await grist.getTable(table).create(payload(table,fields));
    const id=Number(r?.id??r?.[0]?.id??r?.[0]);if(!id)throw new Error('Grist n’a pas confirmé l’enregistrement dans « '+table+' ».');return id;
  }
  async function updateRow(table,id,fields){await grist.getTable(table).update({id:Number(id),...payload(table,fields)});}
  async function deleteRow(table,id){await grist.getTable(table).destroy(Number(id));}
  function refOptions(table,selected=null){return rows(table).map(r=>'<option value="'+Number(r.id)+'" '+(Number(selected)===Number(r.id)?'selected':'')+'>'+esc(recordTitle(table,r))+'</option>').join('');}
  function inputField(id,label,value='',opts={}){
    const req=opts.required?' <span class="required">*</span>':'';
    const type=opts.type||'text';const wide=opts.wide?' wide':'';
    const input=opts.textarea?'<textarea id="'+id+'" '+(opts.required?'required':'')+' placeholder="'+esc(opts.placeholder||'')+'">'+esc(value)+'</textarea>':'<input id="'+id+'" type="'+type+'" value="'+esc(value)+'" '+(opts.required?'required':'')+' placeholder="'+esc(opts.placeholder||'')+'">';
    return '<div class="field'+wide+'"><label for="'+id+'">'+esc(label)+req+'</label>'+input+(opts.help?'<small class="field-help">'+esc(opts.help)+'</small>':'')+'</div>';
  }
  function selectField(id,label,options,selected='',required=false,help=''){
    return '<div class="field"><label for="'+id+'">'+esc(label)+(required?' <span class="required">*</span>':'')+'</label><select id="'+id+'" '+(required?'required':'')+'><option value="">Sélectionnez…</option>'+options+'</select>'+(help?'<small class="field-help">'+esc(help)+'</small>':'')+'</div>';
  }
  function serviceTypeOptions(current=''){
    const values=[...SERVICE_TYPES];if(current&&!values.includes(current))values.push(current);
    return values.map(x=>'<option>'+esc(x)+'</option>').join('');
  }
  function multiSelectField(id,label,options,selected=[],help=''){
    const chosen=new Set(Array.isArray(selected)?selected:[]);
    const rows=options.map(option=>{
      const item=typeof option==='string'?{label:option,description:''}:option;
      return '<label class="multi-option"><input type="checkbox" name="'+id+'" value="'+esc(item.label)+'" '+(chosen.has(item.label)?'checked':'')+'><span><strong>'+esc(item.label)+'</strong>'+(item.description?'<small>'+esc(item.description)+'</small>':'')+'</span></label>';
    }).join('');
    return '<div class="field wide multi-select" id="'+id+'-picker"><label id="'+id+'-label">'+esc(label)+' <span class="field-help">(plusieurs choix possibles)</span></label><button class="multi-select-trigger" id="'+id+'-toggle" type="button" aria-expanded="false" aria-controls="'+id+'-menu"><span id="'+id+'-summary">Choisir une ou plusieurs réponses</span><span aria-hidden="true">⌄</span></button><div class="multi-selected" id="'+id+'-selected"></div><div class="multi-select-panel hidden" id="'+id+'-menu" role="group" aria-labelledby="'+id+'-label">'+rows+'</div>'+(help?'<small class="field-help">'+esc(help)+'</small>':'')+'</div>';
  }
  function publicProfileField(id,selected=[]){
    return multiSelectField(id,'Public accueilli par l’unité',UNIT_PUBLICS,selected,'Les descriptions aident à choisir le bon public. L’unité reprend la catégorie d’âge définie sur l’établissement.');
  }
  function wireMultiSelect(id){
    const root=$(id+'-picker'),button=$(id+'-toggle'),menu=$(id+'-menu'),summary=$(id+'-summary'),selectedBox=$(id+'-selected');
    if(!root||!button||!menu)return;
    const refresh=()=>{
      const values=checkedValues(id);
      summary.textContent=values.length?values.length+' choix sélectionné'+(values.length>1?'s':''):'Choisir une ou plusieurs réponses';
      selectedBox.innerHTML=values.map(value=>'<span class="multi-chip">'+esc(value)+'</span>').join('');
    };
    button.onclick=()=>{
      const open=button.getAttribute('aria-expanded')==='true';
      document.querySelectorAll('.multi-select-panel').forEach(panel=>panel.classList.add('hidden'));
      document.querySelectorAll('.multi-select-trigger').forEach(trigger=>trigger.setAttribute('aria-expanded','false'));
      if(!open){menu.classList.remove('hidden');button.setAttribute('aria-expanded','true');}
    };
    menu.onchange=refresh;
    refresh();
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('.multi-select'))return;
    document.querySelectorAll('.multi-select-panel').forEach(panel=>panel.classList.add('hidden'));
    document.querySelectorAll('.multi-select-trigger').forEach(button=>button.setAttribute('aria-expanded','false'));
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    document.querySelectorAll('.multi-select-panel').forEach(panel=>panel.classList.add('hidden'));
    document.querySelectorAll('.multi-select-trigger').forEach(button=>button.setAttribute('aria-expanded','false'));
  });
  function establishmentPublicOptions(current=''){
    const values=[...ESTABLISHMENT_PUBLICS];if(current&&!values.includes(current))values.push(current);
    return values.map(x=>'<option '+(x===current?'selected':'')+'>'+esc(x)+'</option>').join('');
  }
  function checkedValues(id){return [...document.querySelectorAll('input[name="'+id+'"]:checked')].map(x=>x.value);}
  function isFoyer(type){return /foyer de vie|foyer d’hébergement|foyer d'hebergement/i.test(String(type||''));}
  function setFoyerFields(selectId,containerId){const show=isFoyer($(selectId)?.value);$(containerId)?.classList.toggle('hidden',!show);}
  function setOtherTypeField(selectId,containerId){$(containerId)?.classList.toggle('hidden',!String($(selectId)?.value||'').startsWith('Autre'));}
  function photoField(id,label,currentId=null,wrapId=''){
    return '<div class="field wide"'+(wrapId?' id="'+wrapId+'"':'')+'><label for="'+id+'">'+esc(label)+' <span class="field-help">(facultatif)</span></label><div class="photo-control"><span aria-hidden="true">▧</span><input id="'+id+'" type="file" accept="image/png,image/jpeg,image/webp"></div><small class="photo-help">PNG, JPG ou WebP · 5 Mo maximum</small><div id="'+id+'-preview"></div>'+(currentId?'<label class="remove-photo"><input id="'+id+'-clear" type="checkbox"> Retirer l’image actuelle</label>':'')+'</div>';
  }
  async function showPreview(inputId,currentId){
    const target=$(inputId+'-preview'),file=$(inputId)?.files?.[0];
    if(!target)return;
    target.innerHTML='';
    if(file){const u=URL.createObjectURL(file);target.innerHTML='<img class="preview" src="'+u+'" alt="Aperçu de la photo">';return;}
    if($(inputId+'-clear')?.checked)return;
    if(currentId){const u=await attachmentUrl(currentId);if(u)target.innerHTML='<img class="preview" src="'+esc(u)+'" alt="Photo actuelle">';}
  }
  function wirePhotoField(inputId,currentId=null){
    const input=$(inputId),clear=$(inputId+'-clear');
    if(input)input.onchange=()=>{if(clear)clear.checked=false;showPreview(inputId,currentId);};
    if(clear)clear.onchange=()=>{if(clear.checked&&input)input.value='';showPreview(inputId,currentId);};
    showPreview(inputId,currentId);
  }
  async function applyPhotoChange(fields,label,inputId,currentId=null){
    const file=$(inputId)?.files?.[0];
    if(file){const id=await uploadImage(file);if(id)fields[label]=['L',id];}
    else if(currentId&&$(inputId+'-clear')?.checked)fields[label]=['L'];
  }
  function stepProgress(current,directPole=false){
    const steps=directPole?['Pôle','Services / unités']:['Établissement','Lieux','Services / unités'];
    if(directPole)current=2;
    return '<ol class="steps">'+steps.map((s,i)=>{const n=i+1,cl=n<current?'done':n===current?'current':'';return '<li class="'+cl+'"><span>'+(n<current?'✓':n)+'</span><b>'+s+'</b></li>';}).join('')+'</ol>';
  }
  function setHeader(title,sub=''){
    $('page-title').textContent=title;$('page-subtitle').textContent=sub;
  }
  function render(){
    showMessage('');
    if(state.page==='wizard')return renderWizard();
    if(state.page==='card')return renderCard();
    if(state.page==='pole')return renderPoleCard();
    renderHome();
  }
  function renderHome(){
    setHeader('Carte d’identité de la structure','Créez une fiche, puis ajoutez les lieux et les unités qui la composent.');
    const q=state.search.trim().toLocaleLowerCase('fr');
    const list=rows('Etablissements').filter(r=>recordTitle('Etablissements',r).toLocaleLowerCase('fr').includes(q));
    $('main-panel').innerHTML='<div class="toolbar"><div><h2>Établissements</h2><p>'+list.length+' fiche(s) enregistrée(s)</p></div><div class="toolbar-actions"><button id="manage-poles" class="button secondary">Gérer les pôles</button><button id="manage-charter" class="button secondary">Charte commune</button><button id="new-record" class="button primary">＋ Créer une fiche</button></div></div><div class="home-panel"><div class="search-row"><input id="search" class="search" type="search" placeholder="Rechercher un établissement…" value="'+esc(state.search)+'"><span class="result-count">'+list.length+' résultat(s)</span></div><div class="establishment-list" id="list"></div></div>';
    $('search').oninput=e=>{state.search=e.target.value;renderHome();const s=$('search');s.focus();s.setSelectionRange(s.value.length,s.value.length);};
    $('new-record').onclick=()=>startWizard();
    $('manage-poles').onclick=openPoleManager;$('manage-charter').onclick=openCharterEditor;
    $('list').innerHTML=list.length?list.map(r=>{
      const places=rows('Implantations').filter(p=>readRelation('Implantations',p,'Établissement de rattachement')===Number(r.id));
      const pole=byId('Poles',readRelation('Etablissements',r,'Pôle de rattachement (facultatif)'));
      const photo=attachmentIds(val('Etablissements',r,"Logo ou photo de l’établissement"))[0];
      return '<button class="est-card-button" data-open="'+Number(r.id)+'"><span class="est-thumb" id="thumb-'+Number(r.id)+'">'+(photo?'⌂':'⌂')+'</span><span><strong>'+esc(recordTitle('Etablissements',r))+'</strong><small>'+esc([val('Etablissements',r,'Public de l’établissement'),pole?recordTitle('Poles',pole):'',places.length+' lieu(x)'].filter(Boolean).join(' · '))+'</small></span></button>';
    }).join(''):'<div class="empty-state"><h2>Aucune fiche pour le moment</h2><p>Commence par créer une carte d’identité.</p><button class="button primary" id="new-empty">＋ Créer une fiche</button></div>';
    $('list').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{state.wizard.establishmentId=Number(b.dataset.open);state.wizard.poleId=readRelation('Etablissements',byId('Etablissements',state.wizard.establishmentId),'Pôle de rattachement (facultatif)');state.page='card';render();});
    $('list').querySelectorAll('[data-open]').forEach(b=>{const id=Number(b.dataset.open),r=byId('Etablissements',id),photo=attachmentIds(val('Etablissements',r,"Logo ou photo de l’établissement"))[0];if(photo)attachmentUrl(photo).then(url=>{const el=$('thumb-'+id);if(url&&el)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
    $('new-empty')?.addEventListener('click',()=>startWizard());
  }
  function startWizard(id=null,editing=false,step=1,poleId=null){
    const est=id?byId('Etablissements',id):null;
    if(est&&!poleId)poleId=readRelation('Etablissements',est,'Pôle de rattachement (facultatif)');
    state.page='wizard';state.wizard={step,establishmentId:id,poleId,editing,returnPage:est?'card':poleId?'pole':'home'};renderWizard();
  }
  function renderWizard(){
    const step=state.wizard.step,est=state.wizard.establishmentId?byId('Etablissements',state.wizard.establishmentId):null;
    const directPole=!est&&Number(state.wizard.poleId)>0;
    setHeader(directPole?'Ajouter un service ou une unité au pôle':'Créer une carte d’identité',directPole?'Le pôle est déjà choisi. Vous pourrez ajouter plusieurs fiches.':'Les données sont enregistrées dans Grist au fur et à mesure.');
    let body='';
    if(step===1)body=renderStepOne(est);
    if(step===2)body=renderStepTwo(est);
    if(step===3)body=renderStepThree(est);
    $('main-panel').innerHTML='<div class="wizard-top"><span></span><button class="button quiet small" id="cancel-wizard">← Retour</button></div>'+stepProgress(step,directPole)+body;
    $('cancel-wizard').onclick=()=>{state.page=state.wizard.returnPage||'home';render();};
    if(step===1)wireStepOne(est);
    if(step===2)wireStepTwo(est);
    if(step===3)wireStepThree(est);
  }
  function renderStepOne(est){
    const pole=est?readRelation('Etablissements',est,'Pôle de rattachement (facultatif)'):(Number(state.wizard.poleId)||null);
    const photo=attachmentIds(val('Etablissements',est,"Logo ou photo de l’établissement"))[0];
    const poleRecord=byId('Poles',pole),poleLogo=attachmentIds(val('Poles',poleRecord,'Logo du pôle'))[0];
    return '<div class="wizard-card"><h3>Informations sur l’établissement</h3><p class="wizard-intro">Renseignez les informations générales de votre établissement.</p><form id="est-form"><div class="field-grid">'+
      inputField('est-name',"Nom de l’établissement",val('Etablissements',est,"Nom de l'établissement")||'',{required:true,placeholder:'Ex. Maison des Tilleuls'})+
      selectField('est-public','Public de l’établissement',establishmentPublicOptions(val('Etablissements',est,'Public de l’établissement')||''),val('Etablissements',est,'Public de l’établissement')||'',true,'Choisissez une seule catégorie : petite enfance, enfants/adolescents ou adultes. Un établissement ne mélange pas les publics enfants et adultes.')+
      selectField('est-pole','Pôle de rattachement (facultatif)',refOptions('Poles',pole),pole,false,'Un établissement peut ne pas dépendre d’un pôle.')+
      photoField('est-photo','Logo ou photo de l’établissement',photo)+
      photoField('pole-logo','Logo du pôle',poleLogo||(pole?1:null),'pole-logo-field')+
      inputField('est-address','Adresse administrative',val('Etablissements',est,'Adresse administrative')||'',{required:true,textarea:true,wide:true,placeholder:'Numéro, rue, code postal et commune'})+
      '</div><div class="form-actions"><button class="button primary" type="submit">'+(state.wizard.editing?'Enregistrer les modifications':'Enregistrer et continuer')+' <span>→</span></button></div></form></div>';
  }
  function wireStepOne(est){
    const currentEstPhoto=attachmentIds(val('Etablissements',est,"Logo ou photo de l’établissement"))[0];
    const poleSelect=$('est-pole'),poleLogoField=$('pole-logo-field');
    const showPoleLogo=async()=>{
      const poleId=Number(poleSelect.value)||null,record=byId('Poles',poleId),logo=attachmentIds(val('Poles',record,'Logo du pôle'))[0];
      poleLogoField.classList.toggle('hidden',!poleId);
      $('pole-logo').value='';$('pole-logo-preview').innerHTML='';if($('pole-logo-clear')){$('pole-logo-clear').checked=false;$('pole-logo-clear').parentElement.classList.toggle('hidden',!logo);}
      if(poleId)await showPreview('pole-logo',logo);
    };
    wirePhotoField('est-photo',currentEstPhoto);
    poleSelect.onchange=showPoleLogo;wirePhotoField('pole-logo',attachmentIds(val('Poles',byId('Poles',readRelation('Etablissements',est,'Pôle de rattachement (facultatif)')),'Logo du pôle'))[0]||null);showPoleLogo();
    $('pole-logo').onchange=()=>{if($('pole-logo-clear'))$('pole-logo-clear').checked=false;showPreview('pole-logo',attachmentIds(val('Poles',byId('Poles',Number(poleSelect.value)||null),'Logo du pôle'))[0]||null);};
    if($('pole-logo-clear'))$('pole-logo-clear').onchange=()=>{if($('pole-logo-clear').checked)$('pole-logo').value='';showPreview('pole-logo',attachmentIds(val('Poles',byId('Poles',Number(poleSelect.value)||null),'Logo du pôle'))[0]||null);};
    $('est-form').onsubmit=async e=>{e.preventDefault();if(state.busy)return;state.busy=true;showMessage('Enregistrement de l’établissement…');
      try{
        const selectedPole=Number($('est-pole').value)||null;
        const fields={"Nom de l'établissement":$('est-name').value.trim(),'Public de l’établissement':$('est-public').value,'Pôle de rattachement (facultatif)':selectedPole,'Adresse administrative':$('est-address').value.trim()};
        await applyPhotoChange(fields,'Logo ou photo de l’établissement','est-photo',currentEstPhoto);
        const selectedPoleRecord=byId('Poles',selectedPole),currentPoleLogo=attachmentIds(val('Poles',selectedPoleRecord,'Logo du pôle'))[0]||null,poleFields={};
        await applyPhotoChange(poleFields,'Logo du pôle','pole-logo',currentPoleLogo);
        if(Object.keys(poleFields).length&&!selectedPole)throw new Error('Sélectionnez un pôle avant de modifier son logo.');
        if(est)await updateRow('Etablissements',est.id,fields);else state.wizard.establishmentId=await createRow('Etablissements',fields);
        state.wizard.poleId=selectedPole;
        if(Object.keys(poleFields).length)await updateRow('Poles',selectedPole,poleFields);
        await loadData();if(state.wizard.editing){state.page='card';state.wizard.editing=false;render();showMessage('Les modifications ont été enregistrées.','success');}
        else{state.wizard.step=2;renderWizard();showMessage('Établissement enregistré. Ajoutez maintenant au moins un lieu.','success');}
      }catch(err){showMessage(err.message||String(err),'error');}finally{state.busy=false;}
    };
  }
  function placesFor(est){return rows('Implantations').filter(p=>readRelation('Implantations',p,'Établissement de rattachement')===Number(est?.id));}
  function renderStepTwo(est){
    const places=placesFor(est);
    return '<div class="wizard-card"><h3>Ajouter des lieux</h3><p class="wizard-intro">Ajoutez les adresses et bâtiments utiles. Vous pouvez aussi passer cette étape et rattacher les services plus tard.</p>'+
      '<div class="saved-list">'+(places.length?places.map((p,i)=>placeRow(p,i)).join(''):'')+'</div><form id="place-form"><div class="form-section"><div class="field-grid">'+
      inputField('place-name','Nom du lieu','',{required:true,placeholder:'Ex. Bâtiment principal'})+
      inputField('place-address','Adresse complète','',{required:true,textarea:true,wide:true,placeholder:'Numéro, rue, code postal et commune'})+
      inputField('place-floor','Étage(s) (facultatif)','',{placeholder:'Ex. rez-de-chaussée, 1er étage'})+
      photoField('place-photo','Photo du lieu')+
      '</div></div><div class="form-actions"><button class="button secondary" type="submit">＋ Ajouter un lieu</button><button class="button primary" id="continue-units" type="button">Enregistrer et continuer <span>→</span></button></div></form>'+
      '<div class="info-box"><strong>À savoir</strong> Un lieu est facultatif. Vous pourrez ajouter plusieurs lieux et rattacher les services à un lieu quand vous le connaissez.</div></div>';
  }
  function placeRow(p,i){
    const image=attachmentIds(val('Implantations',p,'Photo du lieu'))[0];
    return '<div class="saved-row"><span class="saved-image" id="place-thumb-'+Number(p.id)+'">'+(image?'⌖':'⌖')+'</span><span class="saved-row-body"><strong>'+esc(recordTitle('Implantations',p))+'</strong><small>'+esc([val('Implantations',p,'Adresse complète'),val('Implantations',p,'Étage(s)')].filter(Boolean).join(' · '))+'</small></span><span class="saved-actions"><button class="mini-button" data-edit-place="'+Number(p.id)+'">Modifier</button><button class="mini-button delete" data-delete-place="'+Number(p.id)+'">Supprimer</button></span></div>';
  }
  function wireStepTwo(est){
    wirePhotoField('place-photo');
    $('place-form').onsubmit=async e=>{e.preventDefault();if(state.busy)return;state.busy=true;showMessage('Enregistrement du lieu…');
      try{
        const fields={'Établissement de rattachement':Number(est.id),'Nom du lieu':$('place-name').value.trim(),'Adresse complète':$('place-address').value.trim(),'Étage(s)':$('place-floor').value.trim()||null};
        await applyPhotoChange(fields,'Photo du lieu','place-photo');
        await createRow('Implantations',fields);await loadData();showMessage('Lieu enregistré. Vous pouvez en ajouter un autre.','success');
      }catch(err){showMessage(err.message||String(err),'error');}finally{state.busy=false;}
    };
    $('continue-units').onclick=()=>{state.wizard.step=3;renderWizard();};
    $('main-panel').querySelectorAll('[data-edit-place]').forEach(b=>b.onclick=()=>editPlace(Number(b.dataset.editPlace)));
    $('main-panel').querySelectorAll('[data-delete-place]').forEach(b=>b.onclick=()=>removePlace(Number(b.dataset.deletePlace)));
    placesFor(est).forEach(p=>{const id=attachmentIds(val('Implantations',p,'Photo du lieu'))[0];if(id)attachmentUrl(id).then(url=>{const el=$('place-thumb-'+p.id);if(el&&url)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
  }
  function unitsFor(est){
    if(!est)return unitsForPole(state.wizard.poleId);
    const id=Number(est.id),placeIds=placesFor(est).map(p=>Number(p.id));
    return rows('Unites').filter(u=>{
      const parentEst=readRelation('Unites',u,'Établissement de rattachement (facultatif)'),parentPole=readRelation('Unites',u,'Pôle de rattachement (facultatif)');
      if(parentEst)return parentEst===id;if(parentPole)return false;
      return placeIds.includes(readRelation('Unites',u,'Lieu'));
    });
  }
  function unitsForPole(id){return rows('Unites').filter(u=>readRelation('Unites',u,'Pôle de rattachement (facultatif)')===Number(id));}
  function establishmentsForPole(id){return rows('Etablissements').filter(e=>readRelation('Etablissements',e,'Pôle de rattachement (facultatif)')===Number(id));}
  function placesForPole(id){
    const estIds=new Set([...establishmentsForPole(id).map(e=>Number(e.id)),...rows('Poles').filter(p=>Number(p.id)===Number(id)).map(p=>readRelation('Poles',p,'Établissement administratif')).filter(Boolean)]);
    return rows('Implantations').filter(p=>estIds.has(readRelation('Implantations',p,'Établissement de rattachement')));
  }
  function renderStepThree(est){
    const directPole=!est&&Number(state.wizard.poleId)>0;
    const units=est?unitsFor(est):unitsForPole(state.wizard.poleId);
    const places=est?placesFor(est):placesForPole(state.wizard.poleId);
    const options=places.map(p=>'<option value="'+Number(p.id)+'">'+esc(recordTitle('Implantations',p))+'</option>').join('');
    const owner=est?'l’établissement « '+recordTitle('Etablissements',est)+' »':'le pôle « '+recordTitle('Poles',byId('Poles',state.wizard.poleId))+' »';
    return '<div class="wizard-card"><h3>Ajouter des services ou des unités</h3><p class="wizard-intro">Chaque service, foyer ou unité a sa propre fiche. Vous pouvez en ajouter plusieurs à '+esc(owner)+'.</p>'+ 
      '<div class="info-box"><strong>Rattachement choisi</strong>Cette fiche sera rattachée à '+esc(owner)+'. Le lieu est facultatif.</div>'+
      (units.length?'<h4>Déjà enregistrés</h4><div class="saved-list">'+units.map(unitRow).join('')+'</div>':'')+
      '<form id="unit-form"><div class="field-grid">'+
      inputField('unit-name',"Nom du service, foyer ou unité",'',{required:true,placeholder:'Ex. Foyer de vie, SAJ ou unité de vie'})+
      selectField('unit-type','Type de service ou d’unité',serviceTypeOptions(),'',true,'Choisissez le type qui correspond à cette fiche.')+
      '<div id="unit-other" class="wide hidden">'+inputField('unit-type-other','Précision du type (si « Autre »)','',{placeholder:'À préciser'})+'</div>'+
      selectField('unit-place','Lieu (facultatif)',placeOptions(places),'',false,'Vous pourrez rattacher un lieu plus tard en modifiant cette fiche.')+
      inputField('unit-floor','Étage (facultatif)','',{placeholder:'Ex. rez-de-chaussée, 1er étage'})+
      photoField('unit-photo','Photo ou logo (facultatif)')+
      publicProfileField('unit-publics',[])+
      '<details class="extra-section wide"><summary>Autres informations (facultatif)</summary><div class="extra-content">'+
      inputField('unit-public-details','Précisions sur le public','',{textarea:true,placeholder:'À compléter si nécessaire.',wide:true})+multiSelectField('unit-modalities',"Modalités d’accueil",MODALITIES,[],'Choisissez une ou plusieurs réponses si vous les connaissez.')+
      '<div id="unit-notifications" class="'+(isFoyer('')?'':'hidden')+'">'+multiSelectField('unit-notifications-list','Orientations / notifications (foyers uniquement)',FOYER_NOTIFICATIONS,[],'À renseigner seulement pour un foyer.')+'</div></div></details>'+ 
      '</div><div class="form-actions"><button class="button secondary" type="submit">＋ Enregistrer cette fiche</button><button class="button primary" type="button" id="finish-wizard">Voir la fiche enregistrée <span>→</span></button></div></form>'+ 
      '<div class="ready-banner"><span class="ready-icon">✓</span><span><strong>'+ (units.length?'Les fiches sont enregistrées':'Vous pouvez continuer plus tard')+'</strong><small>Chaque fiche est enregistrée séparément et peut être modifiée ou supprimée.</small></span></div></div>';
  }
  function unitRow(u){
    const place=byId('Implantations',readRelation('Unites',u,'Lieu')),img=attachmentIds(val('Unites',u,"Photo ou logo de l'unité"))[0],parentLabel=unitParentLabel(u);
    const audiences=listValue('Unites',u,'Public accueilli par l’unité'), modes=listValue('Unites',u,"Modalités d'accueil"), notices=listValue('Unites',u,'Orientations / notifications (foyers uniquement)');
    return '<div class="saved-row"><span class="saved-image" id="unit-thumb-'+Number(u.id)+'">'+(img?'⌂':'⌂')+'</span><span class="saved-row-body"><strong>'+esc(recordTitle('Unites',u))+'</strong><small>'+esc([val('Unites',u,'Type de service'),parentLabel,place?recordTitle('Implantations',place):'',val('Unites',u,'Étage')].filter(Boolean).join(' · '))+'</small>'+(audiences.length?'<small>Public : '+esc(audiences.join(', '))+'</small>':'')+(val('Unites',u,'Précisions sur le public')?'<small>Précisions : '+esc(val('Unites',u,'Précisions sur le public'))+'</small>':'')+(modes.length?'<small>Accueil : '+esc(modes.join(', '))+'</small>':'')+(notices.length?'<small>Orientations : '+esc(notices.join(', '))+'</small>':'')+'</span><span class="saved-actions"><button class="mini-button" data-edit-unit="'+Number(u.id)+'">Modifier</button><button class="mini-button delete" data-delete-unit="'+Number(u.id)+'">Supprimer</button></span></div>';
  }
  function listValue(table,row,label){const v=val(table,row,label);return Array.isArray(v)?v.filter(x=>typeof x==='string'):v?String(v).split(',').map(x=>x.trim()).filter(Boolean):[];}
  function wireStepThree(est){
    const directPole=!est&&Number(state.wizard.poleId)>0;
    const ownerId=directPole?Number(state.wizard.poleId):Number(est?.id);
    wireMultiSelect('unit-publics');wireMultiSelect('unit-modalities');wireMultiSelect('unit-notifications-list');
    wirePhotoField('unit-photo');
    $('unit-type').onchange=()=>setFoyerFields('unit-type','unit-notifications');
    $('unit-type').addEventListener('change',()=>setOtherTypeField('unit-type','unit-other'));
    $('unit-form').onsubmit=async e=>{e.preventDefault();if(state.busy)return;state.busy=true;showMessage('Enregistrement de la fiche…');
      try{
        const type=$('unit-type').value,isF=isFoyer(type);
        const fields={"Nom de l'unité":$('unit-name').value.trim(),'Type de service':type,'Précision du type (si autre)':$('unit-type-other').value.trim()||null,'Public accueilli par l’unité':['L',...checkedValues('unit-publics')],'Précisions sur le public':$('unit-public-details').value.trim()||null,'Lieu':Number($('unit-place').value)||null,'Étage':$('unit-floor').value.trim()||null,"Modalités d'accueil":['L',...checkedValues('unit-modalities')],'Orientations / notifications (foyers uniquement)':isF?['L',...checkedValues('unit-notifications-list')]:['L'],'Établissement de rattachement (facultatif)':directPole?null:ownerId,'Pôle de rattachement (facultatif)':directPole?ownerId:null};
        if(!fields['Type de service'])throw new Error('Choisissez un type de service.');
        if(type==='Autre / à préciser'&&!fields['Précision du type (si autre)'])throw new Error('Précisez le type de service choisi « Autre ».');
        if(checkedValues('unit-publics').includes('Autre public / à préciser')&&!fields['Précisions sur le public'])throw new Error('Précisez le public choisi « Autre ».');
        await applyPhotoChange(fields,"Photo ou logo de l'unité",'unit-photo');
        await createRow('Unites',fields);await loadData();showMessage('Fiche enregistrée. Vous pouvez en ajouter une autre.','success');
      }catch(err){showMessage(err.message||String(err),'error');}finally{state.busy=false;}
    };
    $('finish-wizard').onclick=()=>{state.page=directPole?'pole':'card';state.wizard={step:1,establishmentId:est?.id||null,poleId:directPole?ownerId:state.wizard.poleId,editing:false};render();showMessage('Les fiches sont enregistrées. Vous pouvez les consulter et les modifier.','success');};
    $('main-panel').querySelectorAll('[data-edit-unit]').forEach(b=>b.onclick=()=>editUnit(Number(b.dataset.editUnit)));
    $('main-panel').querySelectorAll('[data-delete-unit]').forEach(b=>b.onclick=()=>removeUnit(Number(b.dataset.deleteUnit)));
    units.forEach(u=>{const id=attachmentIds(val('Unites',u,"Photo ou logo de l'unité"))[0];if(id)attachmentUrl(id).then(url=>{const el=$('unit-thumb-'+u.id);if(el&&url)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
  }
  function unitParentKey(unit){
    const est=readRelation('Unites',unit,'Établissement de rattachement (facultatif)');
    if(est)return 'est:'+est;
    const pole=readRelation('Unites',unit,'Pôle de rattachement (facultatif)');
    if(pole)return 'pole:'+pole;
    const place=byId('Implantations',readRelation('Unites',unit,'Lieu'));
    const legacyEst=place?readRelation('Implantations',place,'Établissement de rattachement'):null;
    return legacyEst?'est:'+legacyEst:'';
  }
  function unitParentOptions(selected=''){
    const est=rows('Etablissements').map(e=>'<option value="est:'+Number(e.id)+'" '+(selected==='est:'+Number(e.id)?'selected':'')+'>Établissement — '+esc(recordTitle('Etablissements',e))+'</option>').join('');
    const pole=rows('Poles').map(p=>'<option value="pole:'+Number(p.id)+'" '+(selected==='pole:'+Number(p.id)?'selected':'')+'>Pôle — '+esc(recordTitle('Poles',p))+'</option>').join('');
    return est+pole;
  }
  function unitParentLabel(unit){
    const key=unitParentKey(unit);if(!key)return 'Rattachement à choisir';
    const [kind,id]=key.split(':');return kind==='pole'?recordTitle('Poles',byId('Poles',Number(id))):recordTitle('Etablissements',byId('Etablissements',Number(id)));
  }
  function placesForParent(key){
    const [kind,idText]=String(key||'').split(':'),id=Number(idText)||null;
    if(kind==='est')return placesFor(byId('Etablissements',id));
    if(kind==='pole')return placesForPole(id);
    return [];
  }
  function placeOptions(places,selected=null){
    return '<option value="">Aucun lieu pour le moment</option>'+places.map(p=>'<option value="'+Number(p.id)+'" '+(Number(selected)===Number(p.id)?'selected':'')+'>'+esc(recordTitle('Implantations',p))+'</option>').join('');
  }
  function openPoleCard(id){state.wizard.poleId=Number(id);state.page='pole';render();}
  function renderPoleCard(){
    const pole=byId('Poles',state.wizard.poleId);
    if(!pole){state.page='home';return renderHome();}
    const admin=byId('Etablissements',readRelation('Poles',pole,'Établissement administratif'));
    let members=establishmentsForPole(pole.id);
    if(admin&&!members.some(e=>Number(e.id)===Number(admin.id)))members=[admin,...members];
    const direct=unitsForPole(pole.id);
    setHeader('Fiche du pôle','Le pôle est enregistré une fois. Vous pouvez lui rattacher plusieurs établissements et plusieurs services.');
    $('main-panel').innerHTML='<div class="toolbar"><button class="button quiet small" id="back-poles">← Retour aux structures</button><div class="toolbar-actions"><button class="button secondary" id="edit-pole-card">Modifier le pôle</button><button class="button primary" id="add-est-to-pole">＋ Ajouter un établissement</button><button class="button primary" id="add-unit-to-pole">＋ Ajouter un service / unité</button></div></div>'+ 
      '<div class="section-panel"><div class="section-heading"><div class="section-title"><span class="section-icon">P</span><div><h3>'+esc(recordTitle('Poles',pole))+'</h3><p>Administration située dans : '+esc(admin?recordTitle('Etablissements',admin):'Non renseigné')+'</p></div></div><button class="mini-button delete" id="delete-pole-card">Supprimer le pôle</button></div><p class="association-note">Vous pouvez rattacher plusieurs établissements au pôle. Les fiches de service ou d’unité peuvent aussi être rattachées directement au pôle.</p></div>'+ 
      '<section class="section-panel"><div class="section-heading"><div class="section-title"><span class="section-icon">É</span><div><h3>Établissements rattachés</h3><p>'+members.length+' établissement(s)</p></div></div></div><div class="establishment-list">'+(members.length?members.map(e=>'<button class="est-card-button" data-open-est="'+Number(e.id)+'"><span class="est-thumb">⌂</span><span><strong>'+esc(recordTitle('Etablissements',e))+'</strong><small>'+esc(Number(e.id)===Number(admin?.id)?'Établissement administratif'+(readRelation('Etablissements',e,'Pôle de rattachement (facultatif)')===Number(pole.id)?' · rattaché au pôle':''):'Établissement rattaché au pôle')+'</small></span></button>').join(''):'<div class="empty-state">Aucun établissement rattaché. Vous pouvez en ajouter un.</div>')+'</div></section>'+ 
      '<section class="section-panel"><div class="section-heading"><div class="section-title"><span class="section-icon">♟</span><div><h3>Services, foyers et unités rattachés directement au pôle</h3><p>'+direct.length+' fiche(s)</p></div></div></div><div class="unit-grid">'+(direct.length?direct.map(unitCard).join(''):'<div class="empty-state">Aucun service ou unité directement rattaché à ce pôle.</div>')+'</div></section>';
    $('back-poles').onclick=()=>{state.page='home';render();};
    $('edit-pole-card').onclick=()=>editPole(pole.id);
    $('delete-pole-card').onclick=()=>removePole(pole.id);
    $('add-est-to-pole').onclick=()=>startWizard(null,false,1,pole.id);
    $('add-unit-to-pole').onclick=()=>startWizard(null,false,3,pole.id);
    $('main-panel').querySelectorAll('[data-open-est]').forEach(b=>b.onclick=()=>{state.wizard.establishmentId=Number(b.dataset.openEst);state.page='card';render();});
    $('main-panel').querySelectorAll('[data-edit-unit]').forEach(b=>b.onclick=()=>editUnit(Number(b.dataset.editUnit)));
    $('main-panel').querySelectorAll('[data-delete-unit]').forEach(b=>b.onclick=()=>removeUnit(Number(b.dataset.deleteUnit)));
    direct.forEach(u=>{const id=attachmentIds(val('Unites',u,"Photo ou logo de l'unité"))[0];if(id)attachmentUrl(id).then(url=>{const el=$('unit-view-'+u.id);if(el&&url)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
  }
  function renderCard(){
    const est=byId('Etablissements',state.wizard.establishmentId);if(!est){state.page='home';return renderHome();}
    setHeader('Carte d’identité de la structure','');const places=placesFor(est),units=unitsFor(est),pole=byId('Poles',readRelation('Etablissements',est,'Pôle de rattachement (facultatif)'));
    const mainPhoto=attachmentIds(val('Etablissements',est,"Logo ou photo de l’établissement"))[0];
    const poleLogo=attachmentIds(val('Poles',pole,'Logo du pôle'))[0];
    const communes=[...new Set(places.map(p=>addressTown(val('Implantations',p,'Adresse complète'))).filter(Boolean))].join(', ');
    $('main-panel').innerHTML='<div class="toolbar"><div class="toolbar-actions"><button class="button quiet small" id="back-home">← Toutes les fiches</button>'+(pole?'<button class="button secondary small" id="back-pole">← Retour au pôle</button>':'')+'</div><span></span></div>'+
      '<div class="identity-card"><div class="identity-photo" id="est-photo-view">'+(mainPhoto?'⌂':'⌂')+'</div><div class="identity-content"><span class="saved-label">✓ Fiche enregistrée</span><h2>'+esc(recordTitle('Etablissements',est))+'</h2><div class="identity-meta">'+(val('Etablissements',est,'Public de l’établissement')?'<span><b>Public de l’établissement</b><span>'+esc(val('Etablissements',est,'Public de l’établissement'))+'</span></span>':'')+(pole?'<span><b>Pôle</b><span class="pole-meta"><span>'+esc(recordTitle('Poles',pole))+'</span>'+(poleLogo?'<img class="pole-inline-logo" id="pole-logo-view" alt="Logo du pôle">':'')+'</span></span>':'')+(communes?'<span><b>Commune</b><span>'+esc(communes)+'</span></span>':'')+'<span><b>Adresse administrative</b><span>'+esc(val('Etablissements',est,'Adresse administrative')||'Non renseignée')+'</span></span></div></div><div class="card-actions"><button class="button primary" id="edit-est">✎ Modifier la fiche</button><button class="mini-button delete" id="delete-est">Supprimer</button></div></div>'+
      '<section class="section-panel"><div class="section-heading"><div class="section-title"><span class="section-icon">⌖</span><div><h3>Lieux associés</h3><p>'+places.length+' lieu(x) enregistré(s)</p></div></div><button class="button primary" id="add-place">＋ Ajouter un lieu</button></div><div class="location-grid">'+(places.length?places.map((p,i)=>locationCard(p,i)).join(''):'<div class="empty-state">Aucun lieu enregistré.</div>')+'</div></section>'+
      '<section class="section-panel"><div class="section-heading"><div class="section-title"><span class="section-icon">♟</span><div><h3>Unités / services de l’établissement</h3><p>'+units.length+' unité(s) ou service(s) enregistré(s)</p></div></div><button class="button primary" id="add-unit">＋ Ajouter une unité / service</button></div><div class="unit-grid">'+(units.length?units.map(unitCard).join(''):'<div class="empty-state">Aucune unité ou service enregistré.</div>')+'</div><div class="association-note">Les informations et la charte de l’association sont communes. Elles ne se ressaisissent pas sur chaque fiche.</div></section>';
    $('back-home').onclick=()=>{state.page='home';render();};
    $('back-pole')?.addEventListener('click',()=>openPoleCard(pole.id));
    $('edit-est').onclick=()=>startWizard(est.id,true,1);
    $('delete-est').onclick=()=>removeEstablishment(est);
    $('add-place').onclick=()=>startWizard(est.id,false,2);
    $('add-unit').onclick=()=>startWizard(est.id,false,3);
    $('main-panel').querySelectorAll('[data-edit-place]').forEach(b=>b.onclick=()=>editPlace(Number(b.dataset.editPlace)));
    $('main-panel').querySelectorAll('[data-delete-place]').forEach(b=>b.onclick=()=>removePlace(Number(b.dataset.deletePlace)));
    $('main-panel').querySelectorAll('[data-edit-unit]').forEach(b=>b.onclick=()=>editUnit(Number(b.dataset.editUnit)));
    $('main-panel').querySelectorAll('[data-delete-unit]').forEach(b=>b.onclick=()=>removeUnit(Number(b.dataset.deleteUnit)));
    if(mainPhoto)attachmentUrl(mainPhoto).then(url=>{const el=$('est-photo-view');if(url&&el)el.innerHTML='<img src="'+esc(url)+'" alt="Logo ou photo de l’établissement">';});
    if(poleLogo)attachmentUrl(poleLogo).then(url=>{const el=$('pole-logo-view');if(url&&el)el.src=url;});
    places.forEach(p=>{const id=attachmentIds(val('Implantations',p,'Photo du lieu'))[0];if(id)attachmentUrl(id).then(url=>{const el=$('place-view-'+p.id);if(url&&el)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
    units.forEach(u=>{const id=attachmentIds(val('Unites',u,"Photo ou logo de l'unité"))[0];if(id)attachmentUrl(id).then(url=>{const el=$('unit-view-'+u.id);if(url&&el)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
  }
  function addressTown(address){
    const parts=String(address||'').split(',').map(s=>s.trim()).filter(Boolean);
    return parts.length>1?parts[parts.length-1].replace(/^\d{5}\s*/, ''):'';
  }
  function locationCard(p,i){
    const id=Number(p.id),img=attachmentIds(val('Implantations',p,'Photo du lieu'))[0];
    return '<article class="location-card"><div class="location-photo" id="place-view-'+id+'">⌖</div><div class="location-details"><span class="place-tag">'+(i===0?'Lieu principal':'Site associé')+'</span><strong>'+esc(recordTitle('Implantations',p))+'</strong><p><b>Adresse</b><br>'+esc(val('Implantations',p,'Adresse complète')||'Adresse non renseignée')+(val('Implantations',p,'Étage(s)')?'<br><b>Étage</b><br>'+esc(val('Implantations',p,'Étage(s)')):'')+'</p></div><div class="saved-actions"><button class="mini-button" data-edit-place="'+id+'">Modifier</button><button class="mini-button delete" data-delete-place="'+id+'">×</button></div></article>';
  }
  function unitCard(u){
    const id=Number(u.id),place=byId('Implantations',readRelation('Unites',u,'Lieu')),parentLabel=unitParentLabel(u);
    const audiences=listValue('Unites',u,'Public accueilli par l’unité'),modes=listValue('Unites',u,"Modalités d'accueil"),notices=listValue('Unites',u,'Orientations / notifications (foyers uniquement)');
    return '<article class="unit-card"><div class="unit-photo" id="unit-view-'+id+'">♟</div><div class="unit-details"><strong>'+esc(recordTitle('Unites',u))+'</strong><p>'+esc([val('Unites',u,'Type de service'),parentLabel,place?recordTitle('Implantations',place):'',val('Unites',u,'Étage')].filter(Boolean).join(' · '))+'</p>'+(audiences.length?'<small>Public : '+esc(audiences.join(', '))+'</small>':'')+(val('Unites',u,'Précisions sur le public')?'<small>Précisions : '+esc(val('Unites',u,'Précisions sur le public'))+'</small>':'')+(modes.length?'<small>Accueil : '+esc(modes.join(', '))+'</small>':'')+(notices.length?'<small>Orientations : '+esc(notices.join(', '))+'</small>':'')+'</div><div class="saved-actions"><button class="mini-button" data-edit-unit="'+id+'">Modifier</button><button class="mini-button delete" data-delete-unit="'+id+'">×</button></div></article>';
  }
  function modal(title,body){
    const d=$('edit-dialog');d.innerHTML='<div class="dialog-head"><h2>'+esc(title)+'</h2><button type="button" class="mini-button" id="close-dialog">Fermer</button></div><div class="dialog-body">'+body+'</div>';d.showModal();$('close-dialog').onclick=()=>d.close();return d;
  }
  function editPlace(id){
    const p=byId('Implantations',id);if(!p)return;
    const currentPhoto=attachmentIds(val('Implantations',p,'Photo du lieu'))[0];
    const d=modal('Modifier le lieu','<form id="edit-place-form"><div class="field-grid">'+inputField('ep-name','Nom du lieu',val('Implantations',p,'Nom du lieu')||'',{required:true})+inputField('ep-address','Adresse complète',val('Implantations',p,'Adresse complète')||'',{required:true,textarea:true,wide:true})+inputField('ep-floor','Étage(s)',val('Implantations',p,'Étage(s)')||'')+photoField('ep-photo','Photo du lieu',currentPhoto)+'</div><div class="dialog-actions"><button class="button primary">Enregistrer</button><button class="button quiet" type="button" id="cancel-edit">Annuler</button></div></form>');
    $('cancel-edit').onclick=()=>d.close();wirePhotoField('ep-photo',currentPhoto);
    $('edit-place-form').onsubmit=async e=>{e.preventDefault();try{const f={'Nom du lieu':$('ep-name').value.trim(),'Adresse complète':$('ep-address').value.trim(),'Étage(s)':$('ep-floor').value.trim()||null};await applyPhotoChange(f,'Photo du lieu','ep-photo',currentPhoto);await updateRow('Implantations',id,f);d.close();await loadData();showMessage('Lieu modifié.','success');}catch(err){showMessage(err.message||String(err),'error');}};
  }
  function editUnit(id){
    const u=byId('Unites',id);if(!u)return;const photo=attachmentIds(val('Unites',u,"Photo ou logo de l'unité"))[0];
    const currentType=String(val('Unites',u,'Type de service')||''), audiences=listValue('Unites',u,'Public accueilli par l’unité'), modes=listValue('Unites',u,"Modalités d'accueil"), notices=listValue('Unites',u,'Orientations / notifications (foyers uniquement)');
    const parentKey=unitParentKey(u),currentPlace=readRelation('Unites',u,'Lieu'),otherValue=val('Unites',u,'Précision du type (si autre)')||'';
    const places=placesForParent(parentKey);
    const body='<form id="edit-unit-form"><div class="field-grid">'+inputField('eu-name',"Nom du service, foyer ou unité",val('Unites',u,"Nom de l'unité")||'',{required:true})+selectField('eu-type','Type de service ou d’unité',serviceTypeOptions(currentType),currentType,true)+ '<div id="eu-other" class="wide '+(currentType.startsWith('Autre')?'':'hidden')+'">'+inputField('eu-type-other','Précision du type (si « Autre »)',otherValue,{placeholder:'À préciser'})+'</div>'+selectField('eu-parent','Rattaché à',unitParentOptions(parentKey),parentKey,true,'Choisissez le pôle ou l’établissement auquel cette fiche appartient.')+selectField('eu-place','Lieu (facultatif)',placeOptions(places,currentPlace),currentPlace,false,'Vous pouvez choisir un lieu ou laisser ce champ vide.')+inputField('eu-floor','Étage (facultatif)',val('Unites',u,'Étage')||'')+photoField('eu-photo','Photo ou logo (facultatif)',photo)+publicProfileField('eu-publics',audiences)+'<details class="extra-section wide" open><summary>Autres informations (facultatif)</summary><div class="extra-content">'+inputField('eu-public-details','Précisions sur le public',val('Unites',u,'Précisions sur le public')||'',{textarea:true,placeholder:'À compléter si nécessaire.',wide:true})+multiSelectField('eu-modalities',"Modalités d’accueil",MODALITIES,modes)+ '<div id="eu-notifications" class="'+(isFoyer(currentType)?'':'hidden')+'">'+multiSelectField('eu-notifications-list','Orientations / notifications (foyers uniquement)',FOYER_NOTIFICATIONS,notices,'À renseigner seulement pour un foyer.')+'</div></div></details></div><div class="dialog-actions"><button class="button primary">Enregistrer</button><button class="button quiet" type="button" id="cancel-edit">Annuler</button></div></form>';
    const d=modal('Modifier la fiche',body);
    wireMultiSelect('eu-publics');wireMultiSelect('eu-modalities');wireMultiSelect('eu-notifications-list');wirePhotoField('eu-photo',photo);
    $('cancel-edit').onclick=()=>d.close();
    $('eu-parent').onchange=()=>{const old=Number($('eu-place').value)||null;const list=placesForParent($('eu-parent').value);$('eu-place').innerHTML=placeOptions(list,list.some(p=>Number(p.id)===old)?old:null);};
    $('eu-type').onchange=()=>setFoyerFields('eu-type','eu-notifications');$('eu-type').addEventListener('change',()=>setOtherTypeField('eu-type','eu-other'));
    $('edit-unit-form').onsubmit=async e=>{e.preventDefault();try{
      const type=$('eu-type').value,isF=isFoyer(type),parts=String($('eu-parent').value||'').split(':'),kind=parts[0],parentId=Number(parts[1])||null;
      if(!parentId||!['est','pole'].includes(kind))throw new Error('Choisissez un pôle ou un établissement.');
      const f={"Nom de l'unité":$('eu-name').value.trim(),'Type de service':type,'Précision du type (si autre)':$('eu-type-other').value.trim()||null,'Public accueilli par l’unité':['L',...checkedValues('eu-publics')],'Précisions sur le public':$('eu-public-details').value.trim()||null,'Lieu':Number($('eu-place').value)||null,'Étage':$('eu-floor').value.trim()||null,"Modalités d'accueil":['L',...checkedValues('eu-modalities')],'Orientations / notifications (foyers uniquement)':isF?['L',...checkedValues('eu-notifications-list')]:['L'],'Établissement de rattachement (facultatif)':kind==='est'?parentId:null,'Pôle de rattachement (facultatif)':kind==='pole'?parentId:null};
      if(type==='Autre / à préciser'&&!f['Précision du type (si autre)'])throw new Error('Précisez le type de service choisi « Autre ».');
      if(checkedValues('eu-publics').includes('Autre public / à préciser')&&!f['Précisions sur le public'])throw new Error('Précisez le public choisi « Autre ».');
      await applyPhotoChange(f,"Photo ou logo de l'unité",'eu-photo',photo);await updateRow('Unites',id,f);d.close();await loadData();showMessage('Fiche modifiée.','success');
    }catch(err){showMessage(err.message||String(err),'error');}};
  }
  async function removeUnit(id){
    const unit=byId('Unites',id);if(!unit)return;
    if(!confirm('Supprimer définitivement « '+recordTitle('Unites',unit)+' » ? Cette unité ou ce service et ses informations associées seront supprimés.'))return;
    try{await deleteRow('Unites',id);await loadData();showMessage('Unité / service supprimé.','success');}catch(err){showMessage('La suppression n’a pas pu être terminée. '+(err.message||String(err)),'error');}
  }
  async function removePlace(id){
    const place=byId('Implantations',id);if(!place)return;
    const children=rows('Unites').filter(u=>readRelation('Unites',u,'Lieu')===id);
    const msg=children.length?'Supprimer le lieu « '+recordTitle('Implantations',place)+' » ? Les '+children.length+' services / unités seront conservés, mais leur lieu sera retiré.':'Supprimer définitivement le lieu « '+recordTitle('Implantations',place)+' » ?';
    if(!confirm(msg))return;
    try{
      const estId=readRelation('Implantations',place,'Établissement de rattachement');
      for(const u of children){
        const parentEst=readRelation('Unites',u,'Établissement de rattachement (facultatif)'),parentPole=readRelation('Unites',u,'Pôle de rattachement (facultatif)');
        const update={'Lieu':null};if(!parentEst&&!parentPole&&estId)update['Établissement de rattachement (facultatif)']=estId;
        await updateRow('Unites',u.id,update);
      }
      await deleteRow('Implantations',id);await loadData();showMessage('Lieu supprimé. Les fiches de service et d’unité ont été conservées.','success');
    }catch(err){showMessage('La suppression n’a pas pu être terminée. Rechargez les données et vérifiez les liens. '+(err.message||String(err)),'error');}
  }
  async function removeEstablishment(est){
    const places=placesFor(est),children=unitsFor(est);
    const poles=rows('Poles').filter(p=>readRelation('Poles',p,'Établissement administratif')===Number(est.id));
    if(poles.length){showMessage('Suppression impossible pour le moment : cet établissement héberge l’administration du pôle « '+recordTitle('Poles',poles[0])+' ». Dans « Gérer les pôles », modifiez ce pôle et choisissez un autre établissement administratif, ou supprimez d’abord le pôle.','error');return;}
    if(!confirm('Supprimer « '+recordTitle('Etablissements',est)+' », ses '+places.length+' lieu(x) et ses '+children.length+' unité(s) / service(s) ? Les unités et les lieux associés seront également supprimés.'))return;
    try{
      const placeIds=new Set(places.map(p=>Number(p.id)));
      const poleChildren=rows('Unites').filter(u=>placeIds.has(readRelation('Unites',u,'Lieu'))&&readRelation('Unites',u,'Pôle de rattachement (facultatif)'));
      for(const u of poleChildren)await updateRow('Unites',u.id,{'Lieu':null});
      for(const u of children)await deleteRow('Unites',u.id);for(const p of places)await deleteRow('Implantations',p.id);await deleteRow('Etablissements',est.id);state.page='home';await loadData();showMessage('Établissement supprimé. Les services rattachés directement à un pôle ont été conservés sans leur ancien lieu.','success');}catch(err){showMessage(err.message||String(err),'error');}
  }
  function openCharterEditor(){
    const a=rows('Association')[0]||null;
    const body='<p>Ces informations sont communes à tous les établissements.</p><form id="charter-form"><div class="field-grid">'+
      inputField('c-name',"Nom de l'association",val('Association',a,"Nom de l'association")||'Odynéo')+
      inputField('c-primary','Couleur principale (HEX)',val('Association',a,'Couleur principale (HEX)')||'#173D64')+
      inputField('c-secondary','Couleur secondaire (HEX)',val('Association',a,'Couleur secondaire (HEX)')||'#DE8436')+
      inputField('c-accent',"Couleur d'accent (HEX)",val('Association',a,"Couleur d'accent (HEX)")||'#A9C442')+
      photoField('c-logo',"Logo de l'association",attachmentIds(val('Association',a,"Logo de l'association"))[0])+ 
      '</div><div class="dialog-actions"><button class="button primary">Enregistrer</button><button type="button" id="cancel-charter" class="button quiet">Annuler</button></div></form>';
    const currentLogo=attachmentIds(val('Association',a,"Logo de l'association"))[0]||null;
    const d=modal('Charte commune',body);$('cancel-charter').onclick=()=>d.close();wirePhotoField('c-logo',currentLogo);
    $('charter-form').onsubmit=async e=>{e.preventDefault();try{const f={"Nom de l'association":$('c-name').value.trim(),'Couleur principale (HEX)':$('c-primary').value.trim(),'Couleur secondaire (HEX)':$('c-secondary').value.trim(),"Couleur d'accent (HEX)":$('c-accent').value.trim()};await applyPhotoChange(f,"Logo de l'association",'c-logo',currentLogo);if(a)await updateRow('Association',a.id,f);else await createRow('Association',f);d.close();await loadData();showMessage('Charte commune enregistrée.','success');}catch(err){showMessage(err.message||String(err),'error');}};
  }
  function openPoleManager(){
    const establishments=rows('Etablissements');
    if(!establishments.length){showMessage('Créez d’abord au moins un établissement. Vous pourrez ensuite créer son pôle administratif.','error');return;}
    const list=rows('Poles').map(p=>'<div class="saved-row"><span class="pole-manager-logo" id="pole-logo-thumb-'+Number(p.id)+'">◉</span><span class="saved-row-body"><strong>'+esc(recordTitle('Poles',p))+'</strong><small>Administration : '+esc(recordTitle('Etablissements',byId('Etablissements',readRelation('Poles',p,'Établissement administratif'))) )+' · '+establishmentsForPole(p.id).length+' établissement(s) rattaché(s) · '+unitsForPole(p.id).length+' service(s) direct(s)</small></span><span class="saved-actions"><button class="mini-button" data-open-pole="'+Number(p.id)+'">Ouvrir</button><button class="mini-button" data-edit-pole="'+Number(p.id)+'">Modifier</button><button class="mini-button delete" data-delete-pole="'+Number(p.id)+'">Supprimer</button></span></div>').join('');
    const body=(list?'<div class="saved-list">'+list+'</div>':'<p>Aucun pôle enregistré.</p>')+'<form id="pole-form"><div class="field-grid">'+inputField('pole-name','Nom du pôle','',{required:true,placeholder:'Ex. Pôle adultes'})+selectField('pole-admin','Établissement où se trouve l’administration',refOptions('Etablissements'),'',true)+photoField('pole-logo-new','Logo du pôle')+'</div><div class="dialog-actions"><button class="button primary">＋ Ajouter le pôle</button></div></form><p class="field-help">Ouvrez un pôle pour lui ajouter plusieurs établissements et des services / unités.</p>';
    const d=modal('Gérer les pôles',body);
    rows('Poles').forEach(p=>{const id=attachmentIds(val('Poles',p,'Logo du pôle'))[0];if(id)attachmentUrl(id).then(url=>{const el=$('pole-logo-thumb-'+p.id);if(el&&url)el.innerHTML='<img src="'+esc(url)+'" alt="">';});});
    wirePhotoField('pole-logo-new');
    $('pole-form').onsubmit=async e=>{e.preventDefault();try{const f={'Nom du pôle':$('pole-name').value.trim(),'Établissement administratif':Number($('pole-admin').value)};await applyPhotoChange(f,'Logo du pôle','pole-logo-new');await createRow('Poles',f);d.close();await loadData();showMessage('Pôle enregistré.','success');}catch(err){showMessage(err.message||String(err),'error');}};
    d.querySelectorAll('[data-open-pole]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.openPole);d.close();openPoleCard(id);});
    d.querySelectorAll('[data-edit-pole]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.editPole);d.close();editPole(id);});
    d.querySelectorAll('[data-delete-pole]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.deletePole);d.close();removePole(id);});
  }
  function editPole(id){
    const returnToPole=state.page==='pole';
    const p=byId('Poles',id);if(!p)return;
    const logo=attachmentIds(val('Poles',p,'Logo du pôle'))[0];
    const d=modal('Modifier le pôle','<form id="edit-pole-form"><div class="field-grid">'+inputField('p-name','Nom du pôle',recordTitle('Poles',p),{required:true})+selectField('p-admin','Établissement où se trouve l’administration',refOptions('Etablissements',readRelation('Poles',p,'Établissement administratif')),readRelation('Poles',p,'Établissement administratif'),true)+photoField('p-logo','Logo du pôle',logo)+'</div><div class="dialog-actions"><button class="button primary">Enregistrer</button></div></form>');
    wirePhotoField('p-logo',logo);
    $('edit-pole-form').onsubmit=async e=>{e.preventDefault();try{const f={'Nom du pôle':$('p-name').value.trim(),'Établissement administratif':Number($('p-admin').value)};await applyPhotoChange(f,'Logo du pôle','p-logo',logo);await updateRow('Poles',id,f);d.close();await loadData();if(returnToPole)openPoleCard(id);else openPoleManager();}catch(err){showMessage(err.message||String(err),'error');}};
  }
  async function removePole(id){
    const pole=byId('Poles',id);if(!pole)return;
    const linked=establishmentsForPole(id),direct=unitsForPole(id),adminId=readRelation('Poles',pole,'Établissement administratif');
    const msg='Supprimer le pôle « '+recordTitle('Poles',pole)+' » ? '+linked.length+' établissement(s) seront conservés sans rattachement au pôle. '+direct.length+' service(s) / unité(s) direct(s) seront conservés et rattachés à leur lieu, ou à l’établissement administratif si aucun lieu n’est indiqué.';
    if(!confirm(msg))return;
    try{
      for(const e of linked)await updateRow('Etablissements',e.id,{'Pôle de rattachement (facultatif)':null});
      for(const u of direct){const place=byId('Implantations',readRelation('Unites',u,'Lieu')),siteEst=place?readRelation('Implantations',place,'Établissement de rattachement'):null;await updateRow('Unites',u.id,{'Pôle de rattachement (facultatif)':null,'Établissement de rattachement (facultatif)':siteEst||adminId||null});}
      await deleteRow('Poles',id);const fromPole=state.page==='pole';state.page='home';await loadData();if(!fromPole)openPoleManager();showMessage('Pôle supprimé. Ses fiches ont été conservées et rattachées à un établissement.','success');
    }catch(err){showMessage('La suppression du pôle n’a pas pu être terminée. Rechargez les données et vérifiez les liens. '+(err.message||String(err)),'error');}
  }


  $('brand').onclick=e=>{e.preventDefault();state.page='home';render();};
  if(!window.grist){setConnection('Aperçu hors Grist',false);$('main-panel').innerHTML='<div class="empty-state"><h2>Ouvrez ce widget depuis Grist</h2><p>Ce formulaire écrit directement dans les tables du document.</p></div>';return;}
  grist.ready({requiredAccess:'full'});
  loadData().catch(err=>{setConnection('Connexion à vérifier',false);showMessage('Le widget n’a pas pu lire les tables. Vérifiez les autorisations d’accès et les colonnes indiquées dans le classeur.\n\nDétail : '+(err.message||String(err)),'error');});
})();
