# Applis Pinokio utiles pour la bêta (analyse du 26 novembre 2026)

Demande de Gabriel : analyser la page 2 des applis « Featured » de Pinokio (https://pinokio.co/apps/featured?page=2) et dire lesquelles, **gratuites seulement**, peuvent l'aider à finir la version bêta.
**Recherche seulement : l'appli n'est pas modifiée.** Informations relevées le 26/11/2026 sur Pinokio et les pages officielles des modèles (liens en bas).

Pinokio installe en un clic des applis d'IA qui tournent **sur l'ordinateur** (Mac de Gabriel). Elles ne tournent pas dans l'appli des élèves, qui est servie par GitHub Pages et le serveur Cloudflare.
Les badges « NVIDIA AMD Apple » de la page sont les mêmes sur toutes les cartes : ils ne disent pas sur quelle machine l'appli marche vraiment.

## À essayer

| Appli | À quoi elle sert pour ניצוץ | Hébreu | Gratuit, usage commercial | Sur le Mac |
|---|---|---|---|---|
| **VoxCPM** (VoxCPM2) | créer la voix de ניצוץ (description ou clonage d'une voix consentante), produire les phrases fixes en audio, voix off de la démo ; mode API (`POST /v1/audio/speech`) | oui (30 langues, dont hébreu, français, anglais) | oui, licence Apache-2.0, « free for commercial use » | non confirmé : prévu pour carte NVIDIA (~8 Go) ; un seul retour d'utilisateur sur Mac (M1 Max). Le modèle léger lancé par défaut (VoxCPM 0.5B) ne clone pas les voix : choisir le profil VoxCPM2 |
| **Ultimate-TTS-Studio** (encadré « Radar » de la même page) | comparer côte à côte plusieurs moteurs de voix, dont Chatterbox Multilingual et VoxCPM, pour choisir la meilleure voix hébraïque | Chatterbox Multilingual : oui (23 langues) | Chatterbox : licence MIT ; chaque fichier porte un filigrane audio invisible de Resemble AI | non confirmé |
| **Stable Audio 3** (modèle Small SFX) | effets sonores du jeu : bonne réponse, nouveau niveau, coffre, badge | sans objet | oui jusqu'à 1 million de dollars de chiffre d'affaires annuel (Stability AI Community License) ; les sons produits appartiennent à l'utilisateur | prévu pour tourner sur un ordinateur portable ; Mac non confirmé |
| **Phosphene** | courtes vidéos avec son pour présenter l'appli (après la bêta) | sans objet | panneau gratuit (MIT) ; licence du modèle LTX 2.3 à lire avant un usage commercial | Mac Apple Silicon uniquement, 32 Go de mémoire au minimum (64 Go pour la pleine définition), environ 31 Go à télécharger |

Limite importante pour la voix : une voix produite sur le Mac ne peut pas dire les réponses en direct de ניצוץ. Pour cela, il faut une voix servie par internet (voir `docs/voix.md` : Google Chirp 3 HD recommandé). Une voix locale sert aux phrases fixes, à la démo et au choix de la voix ; mélanger deux voix différentes dans l'appli serait à éviter.

## Pas utiles pour la bêta

- **Maestro**, **Wan2GP - AMD**, **HiDream O1 Image** : vidéo ou images, carte NVIDIA ou AMD nécessaire.
- **Underfit**, **StableDAW** : production musicale.
- **Image to Prompt**, **Ideoprompt** : écrivent des consignes pour Ideogram, un service payant.
- **TripoSplat**, **Texturizer**, **AI4AnimationPy**, **Overworld** : 3D et mondes virtuels.
- **DramaBox** : voix très expressive, mais langues non indiquées (hébreu non confirmé) et machine lourde (environ 24 Go de mémoire graphique en usage continu).
- **ds4-webui** : modèle de langage local ; l'appli utilise déjà Claude par son serveur.
- **Odysseus** : espace de travail IA local (licence AGPL, gratuit), qui ferait double emploi avec Claude et Hermes.
- **SearXNG** : moteur de recherche privé ; il ne sert pas à l'appli.
- **Stripper** : retire les métadonnées des photos. L'appli le fait déjà : `fileToJpeg` dans `js/ai.js` redessine chaque photo avant l'envoi, ce qui supprime les métadonnées (lieu, appareil).
- **Euphony** : sessions Codex.

## Ce que cette page ne règle pas

Les plus gros chantiers de la bêta (`HANDOFF.md`) ne sont pas couverts par la page 2 : la lecture de l'écriture manuscrite pour l'espace profs, la validation des programmes, l'essai sur iPhone, la protection du serveur (Turnstile) et le consentement pour les photos de copies.

## Sources

- Page analysée : https://pinokio.co/apps/featured?page=2
- VoxCPM2, langues et licence : https://huggingface.co/openbmb/VoxCPM2/blob/main/README.md
- Lanceur VoxCPM2 pour Pinokio (modes, API) : https://github.com/IAnMove/voxcpm2-pinokio-launcher
- Ultimate-TTS-Studio (moteurs inclus) : https://pinokio.co/apps/github-com-pinokiofactory-ultimate-tts-studio
- Chatterbox Multilingual, langues et licence : https://huggingface.co/ResembleAI/chatterbox/blob/main/README.md
- Stable Audio 3, licence : https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models
- Phosphene, besoins et licences : https://pinokio.co/posts/01kqg1pwa346gn8p44tp7698nc
- DramaBox : https://resemble.ai/learn/models/dramabox
- Odysseus : https://github.com/pewdiepie-archdaemon/odysseus
