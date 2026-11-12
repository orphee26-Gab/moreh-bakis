# Où on en est

Dernière mise à jour : **12 novembre 2026** (Hermes).

> Lire aussi **CLAUDE-HANDOFF.md** (point d'étape de Claude, qui écrit aussi dans ce dépôt depuis le 12 novembre 2026).
>
> Règles de synchronisation entre les deux assistants : **docs/synchronisation.md**. En bref : tirer au début de chaque séance (`node scripts/sync.mjs pull`), puis enregistrer et envoyer à chaque changement (`node scripts/sync.mjs push "message"`).

## Fait

**Application** (maquette, hébreu d'abord, français complet — 230 clés dans les deux langues).
Accueil en forme de jeu, carte de progression par matière et yéhidot, leçons à la voix et à l'écrit, quiz, photographie d'exercice, appel en direct, réservation d'un vrai prof, rapport pour les parents, réglages (mode IA, voix, langue, installation sur iPhone).
Site en ligne : https://orphee26-gab.github.io/moreh-bakis/ (bandeau « טיוטה » = brouillon).

**Programmes scolaires** (`data/curriculum/`). 7 matières, 172 thèmes, lus sur le site du ministère. Tout est en brouillon : chaque fichier garde sa liste de points non vérifiés.
Niveaux affichés : maths 3/4/5, anglais 3/4/5, physique 5, histoire 2, Tanakh 2, hébreu 2, géométrie dans les maths.

**Faculté** (`data/faculty/`). 4 établissements, 159 cours de première année : Université ouverte 31, Technion 49, Tel-Aviv 50, Bar-Ilan 29. Index allégé (`data/faculty/index.json`) et détails par établissement à la demande (`data/faculty/raw/*.json`). Unité des crédits par établissement : נ״ז pour Technion et l'Université ouverte, ש״ס (heures hebdomadaires) pour Tel-Aviv, cours par cours pour Bar-Ilan.

**Serveur gratuit d'IA** (`server/`). En ligne à https://moreh-bakis-proxy.moreh-bakis.workers.dev (Cloudflare Workers, compte personnel de Gabriel, sous-domaine `moreh-bakis`).
- Aucune clé dans le dépôt : la clé Anthropic est dans un secret Cloudflare.
- Protections : seuls le site de l'appli peut l'appeler, modèles Haiku et Sonnet uniquement, réponses plafonnées à 2 400 jetons, demandes limitées à 4 Mo, freinage des rafales (approximatif).
- Il ne stocke rien (le plan gratuit ne permet que 1 000 écritures par jour).
- Testé avec la vraie IA depuis le site en ligne : leçon vocale, leçon écrite, quiz, photo, test de connexion — une requête par action, aucune erreur.
- Plafond de dépense réel : le crédit prépayé Anthropic, recharge automatique à laisser désactivée.

**Automatismes** (`.github/workflows/`).
- `watch-ministry.yml` : chaque dimanche, et tous les jours en août-septembre, compare les pages du ministère à une référence ; ouvre une issue et enregistre la différence. Tourné une fois avec succès (306 fichiers suivis, 0 changement).
- `check-server.yml` : chaque lundi, envoie une demande d'un mot à chaque modèle en passant par le serveur public (≈ 0,00005 $ par semaine) ; ouvre une issue en cas de problème. Tourné une fois avec succès.

**Reçu de Claude le 12/11** (`CLAUDE-HANDOFF.md`, `docs/espace-profs-methode.md`, `reference/claude-version/`). Une version de référence de l'appli en un seul fichier, avec l'**espace profs** qui fonctionne (`reference/claude-version/#teacher`), et la méthode de correction dans l'écriture du prof décrite d'après la demande de Gabriel du 21/10 : page de calibrage de 80 caractères, correction page par page par l'IA, annotations dans l'écriture du prof, vérification par le prof, impression et PDF. Testée avec une police qui simule une écriture (80 caractères sur 80), **pas encore avec une vraie page manuscrite**. À valider par Gabriel avant de la reporter dans l'appli. Relecture par Hermes : aucun secret ni donnée personnelle dans ces fichiers ; les limites du serveur (réponses de 2 400 jetons, images sous 4 Mo) sont déjà prises en compte dans la méthode.

**Synchronisation entre les deux assistants** (12/11). `docs/synchronisation.md` (règles), `scripts/sync.mjs` (tirer, enregistrer, envoyer ; refuse un secret ou un fichier d'élève ; ne force jamais ; s'arrête sur un conflit sans rien écraser) et `.gitattributes` (les lignes ajoutées en même temps à `DECISIONS.md` par les deux assistants sont toutes gardées ; sans cette règle, git bloque). Hermes écrit dans `HANDOFF.md`, Claude dans `CLAUDE-HANDOFF.md`. GitHub détecte aussi les secrets et bloque l'envoi (activé sur le dépôt).

**Tests** : `node --test scripts/` → 52 tests sans réseau (`test-worker.mjs` 17, `test-sync.mjs` 18, `test-set-ai-key.mjs` 9, `test-check-server.mjs` 7, `test-watch.mjs` 1) ; `node scripts/check-i18n.mjs` ; tests navigateur avec micro, voix et appareil photo simulés.

## À faire, par ordre

1. **Espace profs** (le plus gros chantier). Aujourd'hui : `#/teacher` ouvre l'accueil, l'espace de correction de copies à l'écriture du prof n'est pas reconstruit. La méthode de correction doit être précisée par Gabriel avant de construire. Méthode proposée par Claude dans `docs/espace-profs-methode.md` (version qui fonctionne : `reference/claude-version/#teacher`), à valider par Gabriel.
2. **Données à valider par Gabriel** (règle d'or : rien de publié sans document officiel lu).
   - Hébreu : le niveau 5 n'existe pas comme cours, c'est le travail de fin d'études (code 11279) — niveau masqué, à confirmer.
   - Physique : le niveau 1 (« introduction aux sciences ») n'est pas un cours de bagrout — niveau masqué, à confirmer.
   - Pas de Tanakh en 12e.
   - Pas de cours de droit de première année au Technion ni à Tel-Aviv.
   - Lacunes du relevé du 10/11 : PDF de 10e (4 yéhidot) à l'envers, heures de calcul en 5 yéhidot de 12e incohérentes, pas de statistique pour 4 yéhidot de 12e.
3. **Nom de marque** : l'adresse du serveur et le nom du produit ne sont pas décidés (`moreh-bakis` par défaut).
4. **Test sur le vrai iPhone de Gabriel**, puis par une prof de maths.
5. **Finitions** : barre du bas sur ordinateur (largeur), classes en français (Seconde/Première/Terminale déjà en place).

## Problèmes ouverts

- **Le freinage des rafales est approximatif** (Cloudflare compte par point de présence). En test : 26 demandes rapides d'un appareil n'ont jamais déclenché de blocage ; 150 demandes simultanées en ont laissé passer une centaine ; le plafond par adresse IP n'a pas réagi à 200 demandes. Un quota exact par élève demanderait une brique Cloudflare payante (Durable Objects). Le vrai garde-fou reste le crédit prépayé.
- **Le localisateur des mineurs** n'est pas implémenté et ne doit pas l'être sans l'accord de l'avocat.
- **Le contrôle d'origine du serveur d'IA n'arrête pas un script** (remarque de Claude, confirmée : un `curl` avec l'en-tête `Origin` du site obtient de vraies réponses, vu lors des tests du 10/11). Il ne protège que contre les autres sites web ouverts dans un navigateur ; le plafond réel reste le crédit prépayé. Parade gratuite proposée par Claude : Cloudflare Turnstile (contrôle anti-robot vérifié par le serveur) ; plus tard, des comptes élèves. À décider par Gabriel.
- **Business plan** (remarque de Claude) : il ne compte ni la faculté ni l'espace profs, et les coûts ont changé (serveur gratuit, crédit prépayé). Les documents financiers ne sont pas dans ce dépôt public, volontairement.
- **Photos de copies envoyées à l'IA** (espace profs) : consentement et Amendement 13 à traiter avec l'avocat (remarque de Claude).
- **Le compte Cloudflare** est un compte personnel de Gabriel (adresse Gmail). À passer sur une adresse professionnelle avant de monter en charge.

## Commandes utiles (macOS)

```bash
cd ~/moreh-bakis
node scripts/sync.mjs pull                   # début de séance : tire et résume ce que l'autre assistant a envoyé
node scripts/sync.mjs push "message"         # enregistre, refuse un secret, tire, envoie
node scripts/sync.mjs status                 # ce qui reste à envoyer ou à recevoir
python3 -m http.server 8080                  # tester l'appli : http://localhost:8080/
node --test scripts/                         # 52 tests, sans réseau
node scripts/check-server.mjs                # état du serveur d'IA en production
cd server && wrangler deploy                 # republier le serveur
node scripts/set-ai-key.mjs                  # enregistrer ou changer la clé d'IA
```
