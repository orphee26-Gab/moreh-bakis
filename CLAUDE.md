# Consignes pour Claude : projet « מורה בכיס » (Moreh BaKis)

Fichier créé le 19 novembre 2026 avec l'accord de Gabriel. Il résume `docs/synchronisation.md`, qui fait foi (détail des règles et outil `scripts/sync.mjs`). Hermes, l'autre assistant, suit les mêmes règles. Ce fichier ne contient aucune consigne en plus de celles de Gabriel : seul Gabriel décide d'y changer quelque chose.

## Le projet
Prof virtuel par la voix pour les lycéens israéliens (bagrout, 10e-12e, 3/4/5 yéhidot) et les étudiants. Hébreu d'abord (RTL), français disponible. Appli statique (HTML, modules ES, JSON) sur GitHub Pages ; serveur d'IA dans `server/` (Cloudflare Worker). L'état du projet est dans `HANDOFF.md`. Ce dépôt est **public**.

## Avec Gabriel
- Il écrit en français : réponds en français et appelle-le « Gabriel ». Les mots hébreux se prononcent à l'hébraïque (yéhidot). Commandes données pour macOS.
- Avant tout changement important, dis-lui ce que tu vas faire et attends son accord.
- Données du ministère et des facultés : chaque élément vient d'un document officiel réellement lu, sinon il va dans `unverified`. Rien n'est publié avant son « c'est bon ».

## Début de séance
1. `node scripts/sync.mjs pull`
2. Lis `HANDOFF.md`, `CLAUDE-HANDOFF.md` et `DECISIONS.md`.
3. Lis les notes récentes d'Hermes dans le dossier Drive privé `Hermes-Sync/de-hermes` (décision du 25/11/2026, voir `docs/synchronisation.md`).
4. Dis à Gabriel, en 2 ou 3 phrases, ce qu'Hermes a changé.

## À chaque changement, sans attendre la fin de la séance
Quand Gabriel décide, corrige ou demande quelque chose, ou qu'un travail est terminé :
1. une ligne datée dans `DECISIONS.md` (date lue sur la machine, jamais devinée) ;
2. si l'état du projet change, mets à jour `CLAUDE-HANDOFF.md` ;
3. `ASSISTANT=Claude node scripts/sync.mjs push "message clair en français"` ;
4. dis à Gabriel, en une ligne, ce qui a été envoyé.

Ce qui se passe hors du dépôt (ou ne peut pas y aller) : une note datée dans `Hermes-Sync/de-claude`, tout de suite. Dans une longue séance, `node scripts/sync.mjs pull` avant chaque nouvelle demande de Gabriel.

« On synchronise » (Gabriel) veut dire : fais tout cela maintenant.

## Règles
- **Jamais** dans le dépôt : clé d'API, mot de passe, donnée d'élève (copie, scan, nom), adresse e-mail personnelle. Tout cela va dans `.env` (ignoré par git). Les documents financiers restent hors du dépôt, qui est public : tout ce qui y entre est visible par tous.
- Ne supprime pas et ne réécris pas le travail d'Hermes sans l'accord de Gabriel. Pas de `git push --force`, pas de réécriture de l'historique.
- Tout le code, les données et les notes du projet vont dans le dépôt, jamais seulement dans la conversation.
- En cas de conflit, `sync.mjs` s'arrête sans rien écraser : dis-le à Gabriel au lieu de choisir à sa place.

## À savoir
Hermes relève ce dépôt toutes les 30 minutes : ce que tu envoies est vu sans qu'il soit prévenu. Il ne lit pas tes conversations claude.ai : écris l'essentiel dans `CLAUDE-HANDOFF.md` ou `DECISIONS.md`.
