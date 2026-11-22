# Voix gratuites pour ניצוץ : comparatif (22 novembre 2026)

Demande de Gabriel : des voix gratuites, les plus humaines possible, en hébreu, français et anglais.
**Recherche seulement : l'appli n'est pas modifiée.** Prix et quotas relevés le 22/11/2026 sur les pages officielles (liens en bas). Ils changent souvent.

Aujourd'hui, l'appli a deux moteurs de voix : la voix du téléphone (gratuite) et ElevenLabs (clé de l'utilisateur).

## Comparatif

| Service | Hébreu | Français, anglais | Gratuit par mois | Humain | Conditions |
|---|---|---|---|---|---|
| Google Cloud, voix Chirp 3 HD | oui (he-IL, disponible) | oui | 1 million de caractères | très bon | carte bancaire et facturation activée obligatoires, rien n'est débité sous le quota |
| Microsoft Azure, voix neuronales | Hila (femme), Avri (homme) ; les voix « multilingues » parlent aussi hébreu | oui, beaucoup de voix | 0,5 million de caractères | bon | carte bancaire demandée à l'inscription, pas débitée sur le niveau gratuit |
| ElevenLabs, gratuit | oui (modèle v3) | oui | 10 000 crédits (environ 10 minutes) | le meilleur | **usage commercial interdit**, mention « elevenlabs.io » obligatoire ; payant dès 6 $/mois pour 30 000 crédits avec licence commerciale |
| Cloudflare Workers AI, MeloTTS | **non** | oui (en, fr) | 10 000 « neurones » par jour, soit plusieurs centaines de minutes d'audio | moyen | déjà sur le compte Cloudflare du projet, sans nouvelle inscription |
| Gemini TTS (Google AI Studio) | en préversion | oui | gratuit avec des limites de débit | très bon | en gratuit, Google peut utiliser les textes envoyés pour améliorer ses produits : à éviter avec des élèves mineurs |
| Phonikud (logiciel libre) | oui, version alpha | non | gratuit sans limite | correct | à faire tourner sur un serveur ou un ordinateur, pas encore prêt pour l'appli |
| Voix du téléphone | Carmit sur iPhone, voix Google sur Android | oui | gratuit, hors ligne | faible à moyen | Safari ne donne pas accès à toutes les voix installées sur l'iPhone |

Ordre de grandeur (estimation) : une leçon fait parler ניצוץ environ 3 000 caractères.
- 1 million de caractères ≈ 300 leçons par mois.
- 0,5 million ≈ 150 leçons.
- Les 10 000 crédits gratuits d'ElevenLabs ≈ 3 leçons.

## Recommandation de Claude (à valider par Gabriel)

1. **Voix principale : Google Chirp 3 HD**, pour les trois langues.
   - Le niveau gratuit est le plus large (1 million de caractères par mois).
   - Ce sont les mêmes voix dans les trois langues, donc ניצוץ garde la même voix en hébreu, français et anglais.
2. **Voix de secours : Azure** (Hila ou Avri en hébreu), si le quota Google est épuisé.
3. **ElevenLabs** seulement pour les essais, tant que l'appli n'est pas commerciale.
4. **La voix du téléphone** reste en dernier recours, sans réseau.

Mise en place technique (après accord de Gabriel) :
- la clé Google reste dans le serveur Cloudflare (`server/`), comme la clé Anthropic, jamais dans le téléphone ni dans le dépôt ;
- le serveur reçoit le texte de ניצוץ, demande l'audio à Google et le renvoie à l'appli ;
- le texte envoyé est seulement la phrase de ניצוץ : pas de photo, pas de voix d'élève.

## Sources

- Google Cloud Text-to-Speech, prix : https://cloud.google.com/text-to-speech/pricing
- Google, voix Chirp 3 HD (langues) : https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- Google, facturation obligatoire : https://docs.cloud.google.com/text-to-speech/docs/get-started
- Azure Speech, prix : https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Azure, compte gratuit (carte bancaire) : https://azure.microsoft.com/en-in/free/free-account-faq/
- Azure, voix multilingues : https://techcommunity.microsoft.com/t5/ai-azure-ai-services-blog/introducing-more-multilingual-ai-voices-optimized-for/ba-p/4012832
- ElevenLabs, prix : https://www.elevenlabs.io/pricing
- ElevenLabs, conditions du plan gratuit : https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
- Cloudflare Workers AI, prix : https://developers.cloudflare.com/workers-ai/platform/pricing/
- Gemini API, prix et usage des données : https://ai.google.dev/gemini-api/docs/pricing
- Gemini TTS, langues : https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
- Phonikud : https://phonikud.github.io/
