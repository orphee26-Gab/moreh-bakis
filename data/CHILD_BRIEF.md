# Consignes pour les agents de recherche (à lire en entier d'abord)

Projet : application d'apprentissage en hébreu « מורה בכיס » pour les lycéens israéliens (préparation au bagrout)
et pour les étudiants. L'agent principal intègre vos fichiers JSON dans l'appli.
Dossier du projet : /Users/gab-macm5/moreh-bakis — date : 10/11/2026 — année scolaire en cours : תשפ"ז (2026-27).
Schémas JSON à respecter : /Users/gab-macm5/moreh-bakis/data/SCHEMA.md (à lire).

## Règles impératives

1. Autonomie totale : vous ne pouvez pas poser de questions.
2. Zéro invention : chaque élément doit venir d'une page ou d'un document que vous avez réellement ouvert pendant
   cette session (web_extract, curl, etc.). Sinon, placez-le dans `unverified` avec la raison.
   Mieux vaut moins d'éléments, mais exacts.
3. Hébreu : recopiez les intitulés tels qu'ils figurent dans les documents officiels. Ajoutez une traduction
   française courte dans `fr` (en français, sans anglais).
4. N'écrivez que dans les fichiers qui vous sont assignés. N'utilisez pas `gh`, ne poussez rien sur GitHub,
   ne touchez à aucun autre fichier, ne lisez aucun fichier personnel de l'utilisateur.
5. Pas de copie de manuels ni de longs extraits : seulement des titres de thèmes, de chapitres ou de cours,
   avec des sous-thèmes courts (8 maximum par thème).
6. Les PDF hébreux sortent souvent à l'envers ou désordonnés à l'extraction. Contrôlez sur un échantillon que
   l'hébreu se lit dans le bon ordre. Sinon changez d'outil : web_extract sur l'URL du PDF, pdftotext,
   pymupdf ou pdfplumber (pip), etc. Quand web_extract tronque une page, lisez le fichier complet dont le chemin
   est indiqué dans le pied de page du résultat (read_file avec offset).
7. Validez le JSON final avec `python3 -m json.tool` et comptez les éléments avant de répondre.
8. Priorité à la couverture complète des niveaux et des classes, puis au détail.
9. Si un site bloque (403, 429, mur anti-robot), notez-le dans `unverified` et passez à une autre source
   officielle. Ne contournez aucune protection technique.
10. Réponse finale (150 mots maximum) : chemins absolus des fichiers écrits, nombre de niveaux et de thèmes
    (ou de cours), documents illisibles ou manquants, 3 à 5 URLs sources principales.
