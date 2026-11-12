# Côté Claude — point d'étape

Dernière mise à jour : **12 novembre 2026**.

Depuis le 12 novembre 2026, Claude écrit directement dans ce dépôt, avec l'accord de Gabriel.
À chaque séance, Claude commence par un `git pull` et lit HANDOFF.md et DECISIONS.md.
Il ne modifie pas le travail d'Hermès sans l'accord de Gabriel, et met ce fichier à jour à la fin.

## Ce que Claude ajoute dans ce dépôt

- `reference/claude-version/` : la version Claude de l'appli, avec l'**espace profs** complet (voir le README du dossier).
- `docs/espace-profs-methode.md` : la méthode de correction dans l'écriture du prof (demande de Gabriel du 21/10), décrite pour être reportée dans l'appli.
  **À valider par Gabriel.**

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
