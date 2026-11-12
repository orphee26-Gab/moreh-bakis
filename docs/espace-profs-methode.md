# Espace profs — méthode de correction dans l'écriture du prof

**Statut : proposition de Claude, à valider par Gabriel avant d'être reportée dans l'appli.**
Elle reprend la demande de Gabriel du 21/10/2026 et décrit ce qui tourne déjà dans la version Claude
(`reference/claude-version/index.html`, entrée par `#teacher`).

## La demande de Gabriel (21/10/2026)

Le prof remplit à la main une page de chiffres et de lettres, pour que l'IA reconnaisse son écriture.
Il scanne la copie de l'élève. L'IA corrige. Une fois la correction terminée, le prof imprime la copie,
avec les corrections écrites dans son écriture à lui.

## Parcours du prof

### Étape 1 · Apprendre l'écriture du prof (une seule fois)

1. **Page de calibrage A4** générée par l'appli (PDF ou impression, à imprimer à 100 %).
   - 4 carrés noirs de 10 mm dans les coins, centrés en (15, 15), (195, 15), (15, 282) et (195, 282) mm.
   - Grille de 8 colonnes × 10 lignes, de droite à gauche, cases de 22,5 × 24,8 mm.
     Dans chaque case : le caractère attendu en petit gris au-dessus, et une ligne de base pointillée à 70 % de la hauteur.
   - **80 caractères** : 0 à 9 ; les 27 lettres hébraïques (finales comprises) ; ✓ ✗ + − = × ÷ / . , : ? ! ( ) % ◯ (cercle pour entourer la note) ; a à z.
2. Le prof écrit au stylo foncé, un caractère par case, sur la ligne pointillée, puis **photographie ou scanne** la page (photo ou PDF).
3. **Découpage automatique** dans le navigateur :
   - repérage des 4 carrés (seuil d'Otsu, composantes connexes, formes carrées et pleines), puis redressement de la page (homographie) ;
   - lecture de chaque case à 7 px/mm, estimation du fond, transparence progressive, suppression des taches ;
   - chaque lettre est gardée en PNG transparent, avec sa largeur, sa hauteur et sa position par rapport à la ligne de base.
4. **Sans imprimante** : le prof peut écrire chaque caractère à l'écran (doigt ou stylet). Une lettre ratée se refait en touchant sa case.
5. Choix de la couleur du stylo : rouge, bleu, vert ou noir.

L'écriture est stockée **uniquement dans le navigateur du prof** (clé `moreh-bakis-teacher-v1` dans la version Claude).

Test réalisé : page remplie avec une police, puis « photographiée » de travers, avec de l'ombre → 80 caractères sur 80 reconnus.
**Pas encore testé avec une vraie page manuscrite.**

### Étape 2 · Corriger une copie

1. **Infos de l'épreuve** : matière, nombre d'unités, titre, nom ou numéro de l'élève, total des points,
   corrigé (facultatif ; il peut être tapé ou photographié, l'IA le recopie).
2. **Pages de la copie** : photo page par page, ou PDF multi-pages (pdf.js, 30 pages au plus).
3. **Correction par l'IA, page par page** ; les annotations apparaissent au fur et à mesure. Réponse attendue de l'IA, en JSON :
   ```json
   {"items":[{"q":"1א","verdict":"ok|partial|wrong","points":12,"max":20,"comment":"חסר + x","x":0.2,"y":0.41}],
    "final_comment":"…"}
   ```
   - `comment` : 8 mots au plus, en hébreu, ton de prof. Vide si la réponse est juste.
   - `x`, `y` : où écrire l'annotation, en fraction de la page, dans l'espace libre à la fin de la réponse.
   - `final_comment` : seulement sur la dernière page.
4. **Annotations dans l'écriture du prof** : ✓ / ✗, points (« 12/20 »), commentaire court, note entourée en haut de la première page, mot de fin.
   - Lettres assemblées une par une, avec de légères variations (rotation, taille, ligne de base) pour éviter l'effet mécanique.
   - Bidi : ligne de droite à gauche, avec des passages de gauche à droite pour les chiffres et les lettres latines.
   - Caractère absent : remplacé par une police manuscrite (Amatic SC).
5. **Vérification par le prof** :
   - faire glisser une annotation pour la déplacer ;
   - la toucher pour modifier son type, la question, les points, le texte ou la taille, ou pour la supprimer ;
   - ajouter une remarque à la main ;
   - tableau des points modifiable, la note se recalcule (somme des points / somme des maxima × total).
6. **Impression** et **PDF A4** (jsPDF) de la copie annotée.

La copie n'est **jamais enregistrée** : elle disparaît quand on ferme la page.
Une copie d'exemple permet de faire la démonstration sans IA.

## Notes pour le report dans l'appli GitHub

- Route `#/teacher`, accessible depuis le profil.
- Appels d'IA par `js/ai.js` et le serveur Cloudflare (jamais de clé dans le navigateur) ; modèle **Sonnet** pour la correction.
- Le serveur plafonne les réponses à **2 400 jetons** : la version Claude en demande 3 000 par page → passer à 2 400.
- Images : réduire chaque page à 1 568 px de côté, en JPEG à 85 % (environ 300 Ko, sous la limite de 4 Mo du serveur).
- Bibliothèques à charger seulement quand on en a besoin (cdnjs) : jsPDF 2.5.1 et pdf.js 3.11.174.
- Textes en hébreu et en français dans `i18n/` (vérifier avec `node scripts/check-i18n.mjs`).

## Limites à garder en tête

- L'écriture reproduite est celle du prof, mais assemblée lettre par lettre. Ça convient bien à l'hébreu, où les lettres ne sont pas liées.
- L'IA place ses annotations à peu près au bon endroit ; le prof en déplacera souvent quelques-unes.
- L'IA peut se tromper : elle propose, le prof valide chaque annotation et reste responsable de la note.
- Les photos des copies sont envoyées à l'IA : consentement et Amendement 13 à traiter avec l'avocat.
- À vérifier : la correction officielle du bagrout passe sans doute par le système du ministère.
  L'outil vise d'abord les contrôles en classe et les מתכונות.
