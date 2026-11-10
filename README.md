# מורה בכיס — Moreh Bakis

Maquette de travail d'un prof virtuel par la voix pour les lycéens israéliens (bagrout) et les étudiants de première année de faculté.

**Site en ligne :** https://orphee26-gab.github.io/moreh-bakis/

## Ce que contient la maquette

- **Leçons à la voix** avec le micro de l'élève (reconnaissance vocale du navigateur) et voix de synthèse.
- **Photographie d'un exercice** : l'IA lit la photo et donne des indices, sans donner la solution tout de suite.
- **Appel en direct** : conversation vocale, avec le contexte de l'exercice photographié.
- **Carte de progression** par matière et par nombre d'unités (3, 4, 5 yéhidot).
- **Section faculté** : comparaison des cours de première année entre établissements.
- **Espace « vrai prof »** : réservation d'un cours en visio, avec résumé envoyé au prof.
- **Hébreu d'abord**, français ensuite (bouton dans les réglages).

## État des lieux (important)

| Élément | État |
|---|---|
| Application | fonctionnelle, testée dans le navigateur |
| Programmes scolaires | **brouillon** : 7 matières, 172 thèmes, assemblés depuis le site du ministère de l'Éducation |
| Faculté | **brouillon** : 4 établissements, 159 cours de première année (Université ouverte, Technion, Tel-Aviv, Bar-Ilan) |
| Serveur gratuit (mandataire d'IA) | **en ligne** (Cloudflare Workers), vérifié chaque semaine ; voir `server/README.md` |
| Clé d'IA | aucune clé dans ce dépôt |

Le bandeau « טיוטה » (brouillon) affiché dans l'application rappelle que les programmes ne sont pas encore validés.

## Installer sur un iPhone

1. Ouvrir le lien dans **Safari**.
2. Toucher le bouton **Partager** (carré avec une flèche).
3. Choisir **« Sur l'écran d'accueil »**.
4. Ouvrir depuis l'icône : l'application s'affiche en plein écran.

## Servir en local

```bash
python3 -m http.server 8080
# puis http://localhost:8080/
```

## Reconstruire les données

```bash
node scripts/build-data.mjs     # data/curriculum/index.json et data/faculty/index.json
node scripts/make-icons.mjs     # icônes PNG
node scripts/check-i18n.mjs     # vérifie que toutes les langues ont les mêmes clés
```

## Serveur mandataire (server/)

Le dossier `server/` contient un « worker » Cloudflare gratuit qui relaie les appels d'IA sans jamais mettre la clé dans le téléphone des élèves. Il ne stocke rien, n'accepte que le site de l'appli et les modèles Haiku et Sonnet, et freine les rafales. Le vrai plafond de dépense est le crédit prépayé du compte Anthropic.

```bash
cd server
wrangler login                             # une seule fois
wrangler deploy                            # publie le serveur
node ../scripts/set-ai-key.mjs             # enregistre ou change la clé d'IA (formulaire local, la clé n'est jamais affichée)
node --test ../scripts/                    # tests, sans réseau
```

Détails, protections et dépannage : `server/README.md`. Le workflow `.github/workflows/check-server.yml` interroge le serveur chaque lundi et ouvre une issue s'il ne répond plus correctement (crédit épuisé, clé refusée, modèle retiré).

## Surveillance du ministère

`.github/workflows/watch-ministry.yml` vérifie chaque dimanche (et tous les jours en août et septembre) si les pages officielles ont changé. L'IA prépare la mise à jour, Gabriel la valide avant publication.

## Confidentialité

- La progression reste sur l'appareil de l'élève (localStorage).
- Aucune clé d'API n'est stockée dans le dépôt.
- La localisation des mineurs n'est pas implémentée.
