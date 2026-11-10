# Serveur mandataire (Cloudflare Workers)

Petit serveur gratuit placé entre l'appli et l'IA (Anthropic). La clé d'IA reste dans un secret Cloudflare : jamais dans le dépôt, jamais dans le téléphone des élèves.

## Ce qu'il fait

- Il ne répond qu'aux sites listés dans `ALLOWED_ORIGINS` (fichier `wrangler.toml`).
- Il n'accepte que les modèles Haiku et Sonnet, plafonne la longueur des réponses (2 400 jetons) et la taille des demandes (4 Mo), et ne transmet rien d'autre à Anthropic que le modèle, le message système, les messages et la longueur.
- Il limite le débit : 20 demandes par minute et par appareil, 120 par minute et par adresse IP (compté par point de présence Cloudflare, donc approximatif).
- Il ne stocke rien. Le plan gratuit de Cloudflare n'autorise que 1 000 écritures par jour dans la base KV : des compteurs y auraient cessé de fonctionner après environ 330 appels.
- Il ne journalise jamais le contenu des échanges, seulement le modèle, le statut et la durée.
- Un crédit ou un plafond Anthropic épuisé devient, côté élève, le message « trop de demandes en ce moment ».

Le vrai plafond de dépense est celui du compte Anthropic : crédit prépayé, recharge automatique désactivée. Le plan gratuit de Cloudflare arrête de lui-même le serveur au-delà de 100 000 requêtes par jour, sans facture.

## Commandes

```
cd server
wrangler login                          # une seule fois
wrangler deploy                         # publie le serveur
wrangler secret put ANTHROPIC_API_KEY   # enregistre la clé d'IA (collée à la main, jamais écrite dans un fichier)
wrangler tail                           # journal en direct
```

Tests sans réseau ni compte : `node --test scripts/test-worker.mjs` (depuis la racine du dépôt).

## Ajouter un site (nom de domaine)

Ajouter son adresse dans `ALLOWED_ORIGINS` de `wrangler.toml`, puis `wrangler deploy`.

## Adresse publique

Une fois le serveur publié, son adresse est inscrite dans `data/server.json` (`proxyUrl`, `deployed: true`). L'appli la lit au démarrage et passe alors toute seule en mode « Serveur » pour ceux qui n'ont pas choisi un autre mode.
