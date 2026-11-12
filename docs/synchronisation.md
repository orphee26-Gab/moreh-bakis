# Synchronisation entre les deux assistants (Claude et Hermes)

Projet : « מורה בכיס » (Moreh BaKis), prof IA par la voix pour le bagrout et la faculté.
Propriétaire : Gabriel (GitHub : orphee26-Gab). Gabriel écrit en français : lui répondre en français, l'appeler « Gabriel ».
Ce dépôt est **public**.

Deux assistants y travaillent : **Claude** et **Hermes**. Tout ce qu'ils savent du projet doit être ici, jamais seulement dans une conversation.
Ce document reprend les règles données par Gabriel et ajoute l'outil `scripts/sync.mjs`.

## Au début de chaque séance

1. `node scripts/sync.mjs pull` (à défaut : `git pull`). Il tire ce que l'autre assistant a envoyé et le résume.
2. Lire `HANDOFF.md`, `CLAUDE-HANDOFF.md` et `DECISIONS.md`.
3. Dire à Gabriel, en 2 ou 3 phrases, ce que l'autre assistant a changé.

## À chaque changement, sans attendre la fin de la séance

Chaque fois que Gabriel décide, corrige ou demande quelque chose, ou qu'un travail est terminé :

1. Une décision ou une consigne de Gabriel : une ligne datée dans `DECISIONS.md` (date lue sur la machine, jamais devinée).
2. Si l'état du projet change (travail fini, problème, tâche nouvelle) : mettre à jour son fichier d'état.
3. `node scripts/sync.mjs push "message clair en français"`, avec `ASSISTANT=Claude` devant pour Claude.
   Il enregistre, refuse d'envoyer un secret, tire, puis envoie.
4. Dire à Gabriel, en une ligne, ce qui a été envoyé.

« On synchronise » (Gabriel) veut dire : faire tout cela maintenant.
Il n'y a pas d'envoi automatique en arrière-plan : c'est l'assistant qui enregistre, avec un message clair.

## Qui écrit où

| Fichier | Écrit par | Contenu |
|---|---|---|
| `HANDOFF.md` | Hermes | état du projet : fait, à faire, problèmes ouverts |
| `CLAUDE-HANDOFF.md` | Claude | son point d'étape et ses remarques |
| `DECISIONS.md` | les deux | une ligne datée par décision de Gabriel ; on ajoute, on ne modifie pas les lignes de l'autre |
| `docs/`, `reference/` | celui qui les a créés | notes et versions de référence |

Chacun ne modifie le fichier d'état de l'autre que pour y mettre un renvoi d'une ligne.
Si les deux ajoutent une ligne à `DECISIONS.md` en même temps, `.gitattributes` fait garder les deux lignes.

## Règles

- **Jamais** dans le dépôt : clé d'API, mot de passe, donnée d'élève (copie, scan, nom), adresse e-mail personnelle.
  Tout cela va dans `.env` (ignoré par git). Les documents financiers restent hors du dépôt, qui est public.
  `sync.mjs` refuse d'envoyer un secret ou un fichier d'élève.
- Ne jamais supprimer ni réécrire le travail de l'autre assistant sans l'accord de Gabriel.
  Pas de `git push --force`, pas de réécriture de l'historique.
- Avant tout changement important, dire à Gabriel ce qu'on va faire et attendre son accord.
- En cas de conflit, `sync.mjs` s'arrête sans rien écraser : le dire à Gabriel au lieu de choisir à sa place.
- Données du ministère et des facultés : rien de publié sans document officiel lu ; sinon dans `unverified`.
- Messages d'enregistrement en français, précédés du nom : `[Claude] …` ou `[Hermes] …` (`sync.mjs` l'ajoute).
- Commandes données à Gabriel : pour macOS.

## L'outil `scripts/sync.mjs`

| Commande | Effet |
|---|---|
| `node scripts/sync.mjs pull` | refuse s'il reste des changements non enregistrés ; sinon tire, liste les envois de l'autre, montre ses nouvelles lignes de `DECISIONS.md` |
| `node scripts/sync.mjs push "message"` | enregistre tout, refuse un secret ou un fichier d'élève, tire, envoie (une seule nouvelle tentative si GitHub a reçu un autre envoi entre-temps) |
| `node scripts/sync.mjs status` | ce qui reste à envoyer ou à recevoir |

Codes de sortie : 0 réussi · 1 refusé (secret, fichier interdit, réseau…) · 2 conflit avec le travail de l'autre (rien n'est écrasé ni envoyé).
Une ligne volontairement inoffensive qui ressemble à un secret peut porter le mot `sync-ignore` en commentaire.
Tests : `node --test scripts/test-sync.mjs`.
