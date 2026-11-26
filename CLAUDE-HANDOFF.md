# Côté Claude — point d'étape

Dernière mise à jour : **25 novembre 2026**.

Depuis le 12 novembre 2026, Claude écrit directement dans ce dépôt, avec l'accord de Gabriel.
À chaque séance, Claude commence par un `git pull` et lit HANDOFF.md et DECISIONS.md.
Il ne modifie pas le travail d'Hermès sans l'accord de Gabriel, et met ce fichier à jour à la fin.

## Ce que Claude ajoute dans ce dépôt

- `reference/claude-version/` : la version Claude de l'appli, avec l'**espace profs** complet (voir le README du dossier).
- `docs/espace-profs-methode.md` : la méthode de correction dans l'écriture du prof (demande de Gabriel du 21/10), décrite pour être reportée dans l'appli.
  **À valider par Gabriel.**

## Fait le 26/11 : barème de biologie, notation par items

- `data/baremes/biologie-9-matieres-organiques.json` : contrôle de כיתה ט (matières organiques, glucides, lipides), 8 parties, 110 points déduits de la copie B. Format décrit dans `data/SCHEMA.md` (`"gradingType": "items"`).
- Ce que l'outil doit savoir faire : `docs/espace-profs-methode.md`, section « Contrôles notés par items ».
- Les copies et la clé de correction restent dans la mémoire OCR privée (lot 6), jamais dans ce dépôt public.
- Questions pour Gabriel : le « 33 » de la partie A, le total sur 110, l'écart de 5 points de la copie A (84 recalculé, 89 donné).

## En cours le 26/11 : une mascotte à la place de ניצוץ (ébauche, choix de Gabriel attendu)

- Gabriel trouve que ניצוץ ne colle pas au projet. Il veut une mascotte animée qui parle sur chaque exercice, en hébreu, français et anglais.
- Il proposait Maestro (« Il était une fois… », Procidis) avec la voix du dessin animé : personnage, nom et voix sont protégés, inutilisables sans licence de Procidis.
- **Pour Hermes : ne mettre dans le dépôt ni dans l'appli aucune image, aucun nom, aucune voix de ce personnage.**
- Ébauche de Claude (page privée) : trois mascottes originales dans le style de l'appli.
  - A. le daman des rochers (שפן סלע), complice ;
  - B. le stylo bleu (עט כחול), précis ;
  - C. la tortue (צב) à carapace en petits carreaux, patiente.
- Chacune a un écran de leçon où elle dit quatre répliques (accueil, indice, juste, presque) dans les trois langues, avec la voix du téléphone en attendant.
- La voix finale sera créée pour la mascotte (par exemple avec VoxCPM2 à partir d'une description, voir `docs/outils-pinokio.md`), sans imiter de voix existante.
- L'appli n'est pas modifiée tant que Gabriel n'a pas choisi.

## Fait le 25/11 : synchro avec Hermes dans les deux sens (validée par Gabriel)

- Règles : `docs/synchronisation.md`, section « Notes dans les deux sens, hors du dépôt » ; une étape ajoutée au début de séance dans `CLAUDE.md`.
- Pour Hermes :
  - un nouveau skill `synchro-claude` arrive dans `~/.hermes/skills/claude-sync/` ; il dit quand lire `~/.hermes/claude-sync/de-claude/` et quand écrire dans `~/.hermes/claude-sync/de-hermes/` ;
  - la première note de Claude y est déjà : ce que Claude a hors du dépôt (Mémoire OCR, Centrale de lecture, tâches planifiées).
- Le script du Mac (`~/.hermes/claude-sync/sync_hermes.sh`) se met à jour tout seul, en 15 à 30 minutes quand le Mac est allumé, et ne supprime rien. Journal : `~/.hermes/claude-sync/sync.log`.

## Fait le 25/11 : premier barème de correction

- `data/baremes/anglais-litterature-6-questions.json` : barème d'anglais donné par Gabriel (6 questions, 3 par partie, 16 points = 8 contenu + 8 langue, total 96), avec les notes réelles de la prof en exemple, anonymes.
- `docs/espace-profs-methode.md`, nouvelle section « Barèmes à deux critères » : ce que l'IA doit faire en plus (lire le numéro de question, deux notes par réponse, langue notée sur la clarté, commentaires en anglais pour l'anglais).
- Pour Hermes : l'espace profs (`#/teacher`), quand il sera reconstruit, doit lire `data/baremes/` ; aucune copie d'élève n'est dans le dépôt.

## Fait le 22/11 : refonte visuelle (validée par Gabriel)

- Tout est décrit dans `docs/refonte-visuelle.md` (audit, direction, fichiers touchés, vérifications, images avant/après).
- Nouveaux fichiers :
  - `js/icons.js` : `icon(nom)` et `tick()`, la coche du prof ;
  - `fonts/` : Rubik, licence OFL.
- Les boutons ont de nouvelles classes : `.btn` (principal), `.btn.secondary`, `.btn.quiet`, `.btn.danger`. Les anciennes (`violet`, `sun`, `ghost`, `coral`) n'existent plus.
- Choix exclusifs : `.seg`. Listes : `.group` et `.item`.
- Pour Hermes : un nouvel écran (par exemple l'espace profs, `#/teacher`) doit suivre ces règles :
  - icônes de `js/icons.js`, jamais d'emoji ;
  - couleurs des variables de `css/app.css` ;
  - espacements en multiples de 4 px ;
  - pas de « ! » dans les textes.
- Fait au passage : sur ordinateur, l'appli garde une largeur de téléphone, centrée (point « finitions » de `HANDOFF.md`).
- Reste : essai sur le vrai iPhone de Gabriel. L'icône a changé ; une appli déjà installée doit être réinstallée pour la voir.

## Ce qui existe côté Claude et n'est pas dans ce dépôt

Ces documents ne sont pas mis ici volontairement, parce que le dépôt est public :
- le business plan (scénarios A et B, document) ;
- le fichier Excel du modèle financier ;
- le kit de lancement sans budget ;
- la maquette de 12 écrans.

Gabriel décide s'ils doivent être partagés et où.

## Remarques de Claude sur le dépôt (à valider par Gabriel)

1. **Serveur d'IA.** Le contrôle d'origine n'arrête que les autres sites web ouverts dans un navigateur.
   Un script peut envoyer un en-tête `Origin` falsifié et consommer le crédit, jusqu'au montant prépayé.
   - Parade gratuite proposée : Cloudflare Turnstile (contrôle anti-robot), vérifié par le worker.
   - Plus tard : des comptes élèves.
2. **Business plan.** Il ne compte ni la section faculté ni l'espace profs, et les coûts ont changé (serveur gratuit, crédit prépayé).
   Il sera à mettre à jour quand les prix de ces deux sections seront décidés.

## Prochaine étape proposée

Reporter l'espace profs dans l'appli (route `#/teacher`) en suivant `docs/espace-profs-methode.md`,
une fois la méthode validée par Gabriel. Voir la section « Notes pour le report » de ce fichier.
