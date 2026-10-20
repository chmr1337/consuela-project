# Discover Romania — Pachet HTML pentru Găzduire Web

Acest folder (`hosting-ready/`) conține versiunea completă a site-ului **Discover Romania**, convertită în pagini pure **HTML, CSS și JavaScript**, gata pentru a fi publicată pe orice platformă de găzduire web din lume (fără a necesita server Node.js, configurări complexe sau baze de date).

---

## 📁 Structura Fișierelor

* `index.html` — Pagina principală cu harta SVG interactivă a României, selector pe sectoare istorice, listă căutabilă de județe și carduri de articole.
* `sectoare.html` — Pagina dedicată celor 10 sectoare și regiuni ale țării (Transilvania, Muntenia, Moldova, Oltenia, Banat, Crișana, Maramureș, Bucovina, Dobrogea și București-Ilfov).
* `panou.html` — **Panoul de Redactare și Administrare**: permite adăugarea, editarea și ștergerea de articole pentru fiecare sector și județ, cu șabloane automate, previzualizare live și salvare locală (`localStorage`).
* `judet.html` — Pagina specifică fiecărui județ (`judet.html?judet=cluj`), cu repere turistice și toate articolele publicate.
* `articol.html` — Cititorul de articole (`articol.html?judet=cluj&slug=locuri-de-vizitat`), cu formatare elegantă, imagini de copertă și recomandări practice.
* `despre.html` — Pagina de prezentare a proiectului.
* `assets/css/styles.css` — Stilurile vizuale și culorile inspirate din peisajul românesc.
* `assets/js/romania-data.js` — Baza de date vectorială cu toate județele, sectoarele și articolele inițiale.
* `assets/js/app.js` — Motorul aplicației și magazinul de date persistent.

---

## 🚀 Cum publici site-ul pe o platformă de găzduire

### 1. Pe Netlify (Cea mai rapidă metodă gratuită — 30 de secunde)
1. Intră pe [app.netlify.com/drop](https://app.netlify.com/drop).
2. Trage direct folderul `hosting-ready` cu mouse-ul în fereastra browserului.
3. Site-ul tău va fi online instantaneu, primind un link securizat HTTPS gratuit!

### 2. Pe cPanel / Hostinger / Găzduire Tradițională (Shared Hosting)
1. Conectează-te la contul tău cPanel sau prin FTP (FileZilla).
2. Deschide folderul `public_html/`.
3. Încarcă direct fișierele din `hosting-ready/` (`index.html`, `sectoare.html`, `panou.html`, `judet.html`, `articol.html`, `despre.html` și folderul `assets/`).
4. Site-ul tău este live pe domeniul tău propriu!

### 3. Pe GitHub Pages
1. Încarcă fișierele din folderul `hosting-ready/` într-un depozit GitHub.
2. Mergi la **Settings** → **Pages**.
3. La **Source**, alege ramura `main` și apasă **Save**.

### 4. Pe Vercel
1. Instalează Vercel CLI (`npm i -g vercel`) sau conectează depozitul pe [vercel.com](https://vercel.com).
2. Setează directorul rădăcină (Root Directory) ca fiind `hosting-ready`.
3. Apasă **Deploy**.

---

## 💻 Testare locală pe calculatorul tău
Poți deschide oricând fișierul `index.html` dând dublu click pe el în Windows Explorer. Va funcționa imediat în Google Chrome, Microsoft Edge, Firefox sau Safari, fără conexiune la internet.
