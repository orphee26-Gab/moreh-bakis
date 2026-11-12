# Décisions

Une ligne par décision prise par Gabriel. La plus récente en haut.

- **2026-11-10 — Plafond de dépense de l'IA = crédit prépayé Anthropic**, recharge automatique désactivée. Le serveur Cloudflare ne tient pas de compteurs (le plan gratuit ne permet que 1 000 écritures par jour, trop peu). La clé est séparée, au nom du projet, jamais dans le dépôt ni dans le téléphone des élèves.
- **2026-11-10 — Le serveur gratuit devient le mode par défaut** de l'appli dès qu'il est en ligne, sauf si l'élève a choisi un autre mode dans les réglages.
- **2026-11-10 — Modèles autorisés : Haiku et Sonnet uniquement** (pas d'Opus, trop cher pour des élèves). Plafond de réponse 2 400 jetons, demande limitée à 4 Mo.
- **2026-11-10 — La clé d'IA est enregistrée par Gabriel lui-même** dans un formulaire local (127.0.0.1, jeton à usage unique), qui l'envoie à Cloudflare par l'entrée standard de `wrangler secret put`. Elle ne transite ni par la conversation, ni par un fichier, ni par un journal.
- **2026-11-10 — Niveaux non confirmés masqués** : hébreu 5 (travail de fin d'études, pas un cours de 5 yéhidot) et physique 1 (« introduction aux sciences », autre programme). À confirmer avant de les réafficher.
- **2026-11-10 — Unité des crédits de faculté par établissement** : נ״ז pour Technion et Université ouverte, ש״ס pour Tel-Aviv, cours par cours pour Bar-Ilan. Ne pas afficher « נק״ז » partout.
- **2026-11-10 — Classes affichées en français** : Seconde / Première / Terminale, avec la lettre hébraïque entre parenthèses.
- **2026-11-10 — Faculté : index allégé et détails à la demande.** Un seul index (`data/faculty/index.json`, ~122 Ko) au lieu de 587 Ko ; le détail de chaque établissement est chargé quand on l'ouvre.
- **2026-11-10 — NOMAD supprimé** (130 Go de cartes, images Docker, base). Aucun lien avec le projet Heretical, qui reste intact. Ne pas le réinstaller.
- **2026-11-10 — Colima ne démarre plus à l'ouverture de session.** Docker reste installé pour Strix ; `colima start` / `colima stop` à la demande.
- **2026-11-10 — La localisation des mineurs n'est pas implémentée.** À trancher avec l'avocat avant toute version.
- **2026-11-10 — Règle d'or des données** : rien de publié sans document officiel lu ; sinon, dans `unverified`.
- **2026-11-10 — Deux surveillances automatiques** : le ministère chaque dimanche (quotidien en août-septembre) et le serveur d'IA chaque lundi. Toutes deux ouvrent une issue ; Gabriel valide avant toute publication.
- **2026-10-21 — Espace profs** : le prof remplit à la main une page de chiffres et de lettres pour que l'IA reconnaisse son écriture, scanne la copie de l'élève, l'IA corrige, puis le prof imprime la copie corrigée dans son écriture.
