# Version Claude (référence)

Copie de l'appli construite avec Claude entre le 20 et le 21 octobre 2026, en un seul fichier (`index.html`).
**Ce n'est pas le produit** : la version de référence est l'appli à la racine du dépôt.
Cette copie sert de modèle pour reporter ce qui manque encore, en premier lieu **l'espace profs**.

- En ligne (une fois publiée) : https://orphee26-gab.github.io/moreh-bakis/reference/claude-version/
- Espace profs : https://orphee26-gab.github.io/moreh-bakis/reference/claude-version/#teacher
- Méthode détaillée : `docs/espace-profs-methode.md`

Fonctions présentes :
- carte de jeu ;
- leçons à la voix ;
- appel en direct ;
- photo d'exercice ;
- réservation d'un vrai prof (démo) ;
- choix des voix (appareil ou ElevenLabs) ;
- mode « prof évaluateur » ;
- **espace profs** : calibrage de l'écriture, scan, correction par l'IA, annotations dans l'écriture du prof, impression et PDF.

Attention : cette copie n'utilise pas le serveur Cloudflare. Pour l'IA, elle demande une clé personnelle dans le profil, et cette clé est stockée dans le navigateur.
Ne pas la donner aux élèves.

Ses données locales (`moreh-bakis-game-v1`, `moreh-bakis-api`, `moreh-bakis-teacher-v1`) n'entrent pas en conflit avec celles de l'appli principale (`mb.v1`).
