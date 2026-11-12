# Serveur mandataire (Cloudflare Workers)

Petit serveur gratuit placé entre l'appli et l'IA (Anthropic). La clé d'IA reste dans un secret Cloudflare : jamais dans le dépôt, jamais dans le téléphone des élèves.

## Ce qu'il fait

- Il ne répond qu'aux sites listés dans `ALLOWED_ORIGINS` (fichier `wrangler.toml`).
- Il n'accepte que les modèles Haiku et Sonnet, plafonne la longueur des réponses (2 400 jetons) et la taille des demandes (4 Mo), et ne transmet rien d'autre à Anthropic que le modèle, le message système, les messages et la longueur.
- Il freine les rafales : 20 demandes par minute et par appareil, 120 par minute et par adresse IP. Le comptage est approximatif (Cloudflare compte par point de présence, avec un léger décalage) : en test, une rafale de 150 demandes simultanées d'un même appareil en a laissé passer une centaine avant que le reste soit bloqué. Ce n'est donc pas un quota exact.
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

Tests sans réseau ni compte : `node --test scripts/test-worker.mjs` (depuis la racine du dépôt). Test dans le vrai moteur Cloudflare, en local : `wrangler dev --local --var ANTHROPIC_API_KEY:essai --var UPSTREAM:http://127.0.0.1:8787/v1/messages` avec `node scripts/mock-ai-server.mjs`.

## Adresse et compte

- Adresse publique : `https://moreh-bakis-proxy.moreh-bakis.workers.dev` (le sous-domaine `moreh-bakis` a été choisi en attendant le nom de marque ; il se change dans le tableau de bord Cloudflare, puis il faut mettre à jour `data/server.json`).
- Le compte Cloudflare est le compte personnel de Gabriel. L'identifiant de connexion de `wrangler` est dans `~/Library/Preferences/.wrangler/config/default.toml` (ne jamais le copier dans le dépôt).

## Changer ou renouveler la clé d'IA

```
node scripts/set-ai-key.mjs
```

Le script ouvre un formulaire local. La clé collée est vérifiée auprès d'Anthropic sur les deux modèles de l'appli, puis envoyée à Cloudflare par l'entrée standard de `wrangler secret put`. Elle n'est ni affichée, ni écrite dans un fichier, ni journalisée.

## Surveillance

`.github/workflows/check-server.yml` s'exécute chaque lundi (et à la demande dans l'onglet Actions). Il envoie une demande d'un seul mot à chaque modèle en passant par le serveur public. S'il y a un problème, une issue « Le serveur d'IA ne répond plus correctement » est ouverte avec la cause probable et le geste à faire (acheter des crédits, changer la clé, mettre à jour un modèle retiré). Les tests du script : `node --test scripts/test-check-server.mjs`.

## Ajouter un site (nom de domaine)

Ajouter son adresse dans `ALLOWED_ORIGINS` de `wrangler.toml`, puis `wrangler deploy`.

## Adresse publique

Une fois le serveur publié, son adresse est inscrite dans `data/server.json` (`proxyUrl`, `deployed: true`). L'appli la lit au démarrage et passe alors toute seule en mode « Serveur » pour ceux qui n'ont pas choisi un autre mode.
