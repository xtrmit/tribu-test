/* Tribu — Question du jour (réponse par émoji) et devinette du jour (réponse secrète).
   Données synchronisées :
   - qdj       uid qdj:<AAAA-MM-JJ>|<membre>        { d, i, e }   (e = émoji choisi, visible de tous)
   - devinette uid devinette:<AAAA-MM-JJ>|<membre>  { d, i, r }   (r = réponse tapée, cachée jusqu'à la révélation)
   La devinette est révélée quand tous les membres connectés ont répondu, ou à 20 h. */
(function () {
  'use strict';
  const Q = window.TRIBU_QUESTIONS || [], D = window.TRIBU_DEVINETTES || [];
  const nom = id => (MEMBRES[id] || { nom: id || '?' }).nom;
  const pad = n => String(n).padStart(2, '0');
  const jour = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const numJour = j => Math.floor(Date.UTC(+j.slice(0, 4), +j.slice(5, 7) - 1, +j.slice(8, 10)) / 864e5);
  const idxQ = j => Q.length ? (numJour(j) * 7 + 3) % Q.length : 0;
  const idxD = j => D.length ? (numJour(j) * 11 + 5) % D.length : 0;
  const HEURE_REVELATION = 20;
  // Le jour où la liste change (mise à jour de l'appli), on garde la question déjà jouée par la tribu.
  const curQ = () => { const r = qdj.find(x => x.data && Q[x.data.i]); return r ? r.data.i : idxQ(j); };
  const curD = () => { const r = dev.find(x => x.data && D[x.data.i]); return r ? r.data.i : idxD(j); };

  // Comparaison tolérante : minuscules, sans accents ni ponctuation, pluriels simplifiés, articles ignorés
  const VIDES = ['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'c', 'est', 'ce', 'ton', 'ta', 'tes', 'mon', 'ma', 'mes', 'c\'est'];
  const mots = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').split(/[^a-z0-9]+/).filter(Boolean);
  const sing = w => w.length > 3 ? w.replace(/[sx]$/, '') : w;
  const norm = s => ' ' + mots(s).filter(w => VIDES.indexOf(w) < 0).map(sing).join(' ') + ' ';
  const brut = s => ' ' + mots(s).map(sing).join(' ') + ' ';
  // Tolérance aux fautes d'orthographe (v0.16.4) : 1 lettre fausse, en trop, en moins ou inversée dès 5 lettres, 2 dès 9 lettres
  // (« artichaud » pour « artichaut »). Les mots courts doivent être exacts.
  const dist = (a, b) => {
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let k = 0; k <= b.length; k++) d[0][k] = k;
    for (let i = 1; i <= a.length; i++) for (let k = 1; k <= b.length; k++) {
      d[i][k] = Math.min(d[i - 1][k] + 1, d[i][k - 1] + 1, d[i - 1][k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
      if (i > 1 && k > 1 && a[i - 1] === b[k - 2] && a[i - 2] === b[k - 1]) d[i][k] = Math.min(d[i][k], d[i - 2][k - 2] + 1);
    }
    return d[a.length][b.length];
  };
  const proche = (a, b) => {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 5) return false;
    const max = Math.max(a.length, b.length) >= 9 ? 2 : 1;
    return Math.abs(a.length - b.length) <= max && dist(a, b) <= max;
  };
  const utiles = s => mots(s).filter(w => VIDES.indexOf(w) < 0).map(sing);
  const approchant = (rep, m) => {
    const R = utiles(rep), M = utiles(m); if (!M.length) return false;
    for (let i = 0; i + M.length <= R.length; i++) if (M.every((w, k) => proche(R[i + k], w))) return true;
    return false;
  };
  const bonne = (rep, liste) => liste.some(m => approchant(rep, m)) || liste.some(m => {
    const k = brut(m);
    if (mots(m).every(w => VIDES.indexOf(w) >= 0)) return mots(rep).length <= 3 && brut(rep).indexOf(k) >= 0; // « dé », « une »…
    return norm(rep).indexOf(norm(m)) >= 0 || brut(rep).indexOf(k) >= 0;
  });

  let qdj = [], dev = [], joueurs = [], j = jour(), editQ = false, devTous = [], msgs = [];

  async function load() {
    j = jour();
    const [a, b, p, ms] = await Promise.all([Sync.all('qdj'), Sync.all('devinette'), Sync.all('presence'), Sync.all('msg')]);
    devTous = b; msgs = ms;
    qdj = a.filter(x => x.data && x.data.d === j);
    dev = b.filter(x => x.data && x.data.d === j);
    const set = {}; p.forEach(x => { if (MEMBRES[x.auteur]) set[x.auteur] = 1; });
    if (me()) set[me()] = 1;
    dev.forEach(x => { set[x.auteur] = 1; }); qdj.forEach(x => { set[x.auteur] = 1; });
    joueurs = ORDRE.filter(id => set[id]);
  }
  const auteurDe = x => (x.uid.split('|')[1]) || x.auteur;
  const reveleeD = () => new Date().getHours() >= HEURE_REVELATION || (joueurs.length > 0 && joueurs.every(id => dev.some(x => auteurDe(x) === id)));

  function renderQ() {
    const q = Q[curQ()]; if (!q) return '';
    const mien = qdj.find(x => auteurDe(x) === me());
    const choix = !mien || editQ;
    const reps = ORDRE.map(id => {
      const r = qdj.find(x => auteurDe(x) === id);
      return r ? `<span class="jr m-${esc(id)}"><span class="je">${esc(r.data.e)}</span><span class="jn">${esc(nom(id))}</span></span>` : '';
    }).join('');
    return `<div class="card jeu">
      <div class="jt">Question du jour</div>
      <div class="jq">${esc(q[0])}</div>
      ${choix ? `<div class="emos">${q[1].map(e => `<button class="emo${mien && mien.data.e === e ? ' on' : ''}" data-emo="${esc(e)}" aria-label="Répondre ${esc(e)}">${e}</button>`).join('')}
        <button class="emo autre" data-act="autre" aria-label="Choisir un autre émoji">+</button></div>` : ''}
      ${reps ? `<div class="jreps">${reps}</div>` : ''}
      ${mien && !editQ ? `<button class="link" data-act="changer">Changer ma réponse</button>` : ''}
    </div>`;
  }

  function renderD() {
    const d = D[curD()]; if (!d) return '';
    const mien = dev.find(x => auteurDe(x) === me());
    const rev = reveleeD();
    let corps;
    if (rev) {
      const gagnants = [];
      const lignes = joueurs.map(id => {
        const r = dev.find(x => auteurDe(x) === id);
        if (!r) return `<div class="dl m-${esc(id)}"><span class="av sm m-${esc(id)}">${esc(MEMBRES[id].ini)}</span><span class="dn">${esc(nom(id))}</span><span class="dr muted">n'a pas joué</span></div>`;
        const ok = bonne(r.data.r, d[2]); if (ok) gagnants.push(nom(id));
        return `<div class="dl"><span class="av sm m-${esc(id)}">${esc(MEMBRES[id].ini)}</span><span class="dn">${esc(nom(id))}</span><span class="dr">${esc(r.data.r)}</span><span class="dk ${ok ? 'ok' : 'ko'}">${ok ? '✓' : '✗'}</span></div>`;
      }).join('');
      corps = `<div class="drep"><span class="muted">La réponse :</span> <b>${esc(d[1])}</b></div>
        <div class="dlist">${lignes}</div>
        <div class="dbravo">${gagnants.length ? 'Bravo à ' + esc(gagnants.length > 1 ? gagnants.slice(0, -1).join(', ') + ' et ' + gagnants[gagnants.length - 1] : gagnants[0]) + ' !' : 'Personne n\'a trouvé… Demain, ce sera la bonne !'}</div>`;
    } else if (mien) {
      const att = joueurs.filter(id => !dev.some(x => auteurDe(x) === id)).map(nom);
      corps = `<div class="dsecret">Ta réponse : <b>${esc(mien.data.r)}</b> <button class="link" data-act="redev">modifier</button></div>
        <div class="muted jp">Réponse dévoilée quand tout le monde aura joué, ou à ${HEURE_REVELATION} h.${att.length ? ' On attend ' + esc(att.join(', ')) + '.' : ''}</div>`;
    } else {
      const n = dev.length;
      corps = `<div class="drow"><input id="devInput" type="text" maxlength="60" autocomplete="off" placeholder="Ta réponse (secrète)…" aria-label="Ta réponse à la devinette">
        <button class="primary" data-act="devok">Valider</button></div>
        <div class="muted jp">${n ? n + ' membre' + (n > 1 ? 's ont' : ' a') + ' déjà répondu. ' : ''}Personne ne voit ta réponse avant la révélation.</div>`;
    }
    return `<div class="card jeu">
      <div class="jt">Devinette du jour</div>
      <div class="jq">${esc(d[0])}</div>
      ${corps}
    </div>`;
  }

  function render() {
    const el = $('todayJeux'); if (!el) return;
    if (!me()) { el.innerHTML = ''; return; }
    const keep = $('devInput') && $('devInput').value;
    const foc = document.activeElement && document.activeElement.id === 'devInput';
    el.innerHTML = renderQ() + renderD();
    if (keep && $('devInput')) $('devInput').value = keep;
    if (foc && $('devInput')) $('devInput').focus();
  }

  async function refresh() { if (!me()) return; await load(); render(); bilans(); }

  // Résultat de la devinette dans le chat (v0.16.3) : publié une seule fois par le premier téléphone qui voit la révélation,
  // ou le lendemain par le premier qui ouvre Tribu, pour garder une trace de qui a répondu quoi.
  const veille = s => { const p = s.split('-').map(Number); const d = new Date(p[0], p[1] - 1, p[2] - 1); return jour(d); };
  const liste = t => t.length > 1 ? t.slice(0, -1).join(', ') + ' et ' + t[t.length - 1] : t[0];
  function bilan(date, rows, rev) {
    if (!rev || !rows.length || !me()) return;
    const ri = rows.find(x => x.data && D[x.data.i]); const d = D[ri ? ri.data.i : idxD(date)]; if (!d) return;
    if (msgs.some(m => m.data && m.data.dev === date)) return;
    const cle = 'devBilan_' + date;
    try { if (localStorage.getItem(cle)) return; localStorage.setItem(cle, '1'); } catch (e) {}
    const ont = ORDRE.filter(id => rows.some(x => auteurDe(x) === id));
    const gagnants = [], parts = ont.map(id => {
      const r = rows.find(x => auteurDe(x) === id), ok = bonne(r.data.r, d[2]); if (ok) gagnants.push(nom(id));
      return (ok ? '✓ ' : '✗ ') + nom(id) + ' : « ' + String(r.data.r).slice(0, 60) + ' »';
    });
    const absents = (date === j ? joueurs : ORDRE).filter(id => ont.indexOf(id) < 0 && MEMBRES[id]).map(nom);
    const p = date.split('-');
    const t = [`🧩 Devinette du ${p[2]}/${p[1]}`, d[0], 'Réponse : ' + d[1]].concat(parts)
      .concat(absents.length ? [`${liste(absents)} ${absents.length > 1 ? 'n\'ont' : 'n\'a'} pas joué`] : [])
      .concat([gagnants.length ? 'Bravo à ' + liste(gagnants) + ' !' : 'Personne n\'a trouvé.']).join('\n');
    Sync.put('msg', 'msg:' + me() + ':dev' + date.replace(/-/g, ''), { t, at: Date.now(), sys: 'jeu', dev: date });
  }
  function bilans() {
    const h = veille(j);
    bilan(h, devTous.filter(x => x.data && x.data.d === h), true);
    bilan(j, dev, reveleeD());
  }

  function repondreQ(e) {
    e = String(e || '').trim(); if (!e) return;
    editQ = false;
    Sync.put('qdj', 'qdj:' + j + '|' + me(), { d: j, i: curQ(), e: e.slice(0, 16) }); vib(8);
  }
  function repondreD() {
    const v = ($('devInput') && $('devInput').value || '').trim(); if (!v) return;
    if (reveleeD()) { toast('Trop tard, la réponse est déjà dévoilée'); return; }
    Sync.put('devinette', 'devinette:' + j + '|' + me(), { d: j, i: curD(), r: v.slice(0, 60) }); vib(8);
  }

  function choisirAutre() {
    openSheet('Ton émoji', `<p class="muted">Tape ou colle l'émoji de ton choix (clavier émoji de ton téléphone).</p>
      <div class="drow"><input id="emoInput" type="text" maxlength="16" autocomplete="off" placeholder="🙂" aria-label="Ton émoji" style="font-size:1.6em;text-align:center">
      <button class="primary" data-act="emook">OK</button></div>`, e => {
      const b = e.target.closest('button');
      if (b && b.dataset.act === 'emook') { const v = $('emoInput').value.trim(); if (v) { repondreQ(v); closeSheet(); } }
    });
    setTimeout(() => $('emoInput') && $('emoInput').focus(), 250);
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.emo) { repondreQ(b.dataset.emo); return; }
    const a = b.dataset.act;
    if (a === 'autre') choisirAutre();
    else if (a === 'changer') { editQ = true; render(); }
    else if (a === 'devok') repondreD();
    else if (a === 'redev') {
      if (reveleeD()) return;
      const mien = dev.find(x => auteurDe(x) === me());
      Sync.remove('devinette', 'devinette:' + j + '|' + me());
      setTimeout(() => { if ($('devInput') && mien) { $('devInput').value = mien.data.r; $('devInput').focus(); } }, 150);
    }
  }
  const box = $('todayJeux');
  box.addEventListener('click', onClick);
  box.addEventListener('keydown', e => { if (e.target.id === 'devInput' && e.key === 'Enter') { e.preventDefault(); repondreD(); } });

  Sync.on(kinds => { if (kinds.some(k => ['qdj', 'devinette', 'presence', 'auth'].indexOf(k) >= 0)) refresh(); });
  // Changement de jour et passage de 20 h sans action de l'utilisateur
  let derniere = jour() + new Date().getHours();
  setInterval(() => {
    const k = jour() + new Date().getHours();
    if (k !== derniere) { derniere = k; editQ = false; refresh(); }
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  refresh();
  window.TribuJeux = { norm, bonne, idxQ, idxD, jour };
})();
