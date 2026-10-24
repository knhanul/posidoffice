import type { zh } from './zh'
export const fr = {
  title: 'Ollama',
  localServer: 'Ollama local',
  description:
    'Ajoutez des serveurs et enregistrez des modèles, puis choisissez-en un dans les réglages IA ou dans un document. La modification de documents nécessite un modèle prenant en charge les appels d’outils.',
  addServer: 'Ajouter un serveur',
  empty: 'Aucun serveur ajouté.',
  serverName: 'Nom du serveur',
  editServer: 'Modifier le serveur',
  installed: 'Modèles installés',
  registered: 'Modèles enregistrés',
  register: 'Enregistrer',
  registeredBadge: 'Enregistré',
  noModels: 'Aucun modèle installé sur ce serveur.',
  noRegistered: 'Enregistrez un modèle depuis la liste des modèles installés.',
  apiKeyOptional: 'Clé API (facultative)',
  invalidUrl: 'Saisissez une adresse HTTP ou HTTPS valide, sans nom d’utilisateur ni mot de passe.',
  loadFailed: 'Impossible de lire les réglages. Réessayez.',
  saveFailed: 'Impossible d’enregistrer les modifications. Réessayez.',
  connectFailed:
    'Impossible de récupérer les modèles. Vérifiez le serveur, l’adresse et la clé API.',
  removeConfirm:
    'Retirer ce serveur et ses modèles enregistrés de la liste ? Les fichiers des modèles sur le serveur seront conservés.',
  loading: 'Lecture des réglages…',
  retry: 'Réessayer',
  refresh: 'Tester la connexion et actualiser les modèles',
  effortLow: 'Bas (Low)',
  effortMedium: 'Moyen (Medium)',
  effortHigh: 'Haut (High)',
} satisfies Record<keyof typeof zh, string>
