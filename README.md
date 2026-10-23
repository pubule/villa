# Villa · dalla pianta alla casa

Le due planimetrie proposte per la villa (soluzioni **3-A** e **3-B**) diventano un modello 3D da percorrere nel browser, sullo stesso principio di [Casa Serra](https://sam1983aing.github.io/casa-serra/): la pagina si apre su una pianta in bianco e nero, scorrendo i muri crescono, la camera scende all'ingresso e attraversa la casa stanza per stanza. Ogni stanza resta un disegno finché la camera non ci arriva, poi i materiali veri si allargano sulle superfici.

Lo stile è quello di [Villa SD a Bordighera](https://homeadore.com/2023/07/05/villa-sd-a-stone-house-treasure-in-bordighera-italy/) (Giordano Hadamik Architects): un solo piano, pergolato con lamelle di legno, rovere e pietra botticino all'interno, ulivi intorno. Al posto del tetto verde di Villa SD c'è un tetto a padiglione in coppi. Fuori le pareti sono in intonaco bianco burro; la pietra (il rivestimento R06A di Abitare in Pietra) è solo nei dettagli: portico d'ingresso, deposito, pilastri e travi del portico sud.

- `index.html#a` → soluzione 3-A
- `index.html#b` → soluzione 3-B

## Come è fatto

- **I muri vengono dai PDF.** I PDF esportati da AutoCAD sono vettoriali: ogni rettangolo grigio della pianta è stato letto con le sue coordinate e convertito in metri (scala 1:100). Sono in `js/walls-data.js`, uno per variante.
- **La pianta non è un'immagine.** È il modello 3D tagliato da un piano a 1,20 m e visto dall'alto con un obiettivo da 5,5°. Le facce interne dei muri tagliati sono disegnate a inchiostro, ed è questo il "pieno" della sezione. Nomi, superfici e quote sono su un foglio trasparente steso sul pavimento (`js/sheet.js`).
- **Disegno → materiali.** Ogni materiale ha uno shader che lo mostra come carta finché la sua stanza non viene "rivelata" (`js/reveal.js`). Le facce dei muri verso un locale sono intonaco (pietra botticino nei bagni), quelle verso l'esterno intonaco bianco burro o pietra.
- **three.js, GSAP ScrollTrigger e Lenis**, file statici senza build. Texture CC0 da [Poly Haven](https://polyhaven.com) e [ambientCG](https://ambientcg.com), 2k per pietra, pavimenti, intonaco e coppi.

## Cosa è letto dalla pianta e cosa è un'ipotesi

Dalla pianta: muri, aperture, superfici, posizione di letti, sanitari, cucina, tavolo, divano, tavolo del portico.

Ipotesi mie: altezze (3,00 m interni, davanzali e architravi), materiali, arredi non disegnati (seconda camera, lavanderia), il fatto che il locale grande a nord sia un'autorimessa (ha un'apertura da 5 m) e il piccolo locale accanto una cantina, l'orientamento del giardino e il sole da ovest nel tardo pomeriggio.

## Andata e ritorno con Unreal

- **Sito → Unreal.** In `mockup.html`, "Modifica arredi" → "Esporta per Unreal (GLB)" scarica la casa com'è (muri, tetto, arredi, piante) in un unico GLB. In Unreal si importa con Interchange (File → Import into Level).
- **Unreal → sito.** In Unreal: File → Export All → glTF binario (`.glb`), con Substrate spento nel progetto, altrimenti i materiali escono neri. Poi "Importa GLB" nel mockup, oppure si mette il file nel repo e si apre `mockup.html?glb=percorso/del/file.glb`.

## Vederla in locale

Serve un server statico qualsiasi, per esempio:

```sh
python3 -m http.server 8000
```

e poi `http://localhost:8000/?v=a`.

Per pubblicarla con GitHub Pages: Settings → Pages → Deploy from a branch → `main`, cartella `/ (root)`.
