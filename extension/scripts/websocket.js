/**
 * Client WebSocket pour recevoir les données agrégées du backend
 * via ws://localhost:3000/data/<repo>.
 *
 * Cette fonction retourne une Promise qui se résout lorsque
 * le backend envoie le message "initialData" contenant les données.
 */
export function fetchDashboardDataViaWebSocket(repo, filters = {}) {
  return new Promise((resolve, reject) => {
    try {
      const wsUrl = `ws://localhost:3000/data/${encodeURIComponent(repo)}`;
      console.log(`Connexion WebSocket → ${wsUrl}`);

      const ws = new WebSocket(wsUrl);
      let resolved = false;

      // Quand la connexion WebSocket s'ouvre, on envoie les filtres au backend
      ws.onopen = () => {
        console.log("WebSocket connecté.");

        const payload = {
          type: "filters",
          filters: {
            aggregationPeriod: filters.aggregationPeriod ?? "day",
            startDate: filters.start?.split("T")[0] ?? null,
            endDate: filters.end?.split("T")[0] ?? null,
            branch: filters.branch?.includes("all") ? null : filters.branch,
            author: filters.actor?.includes("all") ? null : filters.actor,
            workflowName: filters.workflow?.includes("all") ? null : filters.workflow
          }
        };

        console.log("Envoi des filtres:", payload);
        ws.send(JSON.stringify(payload));
      };

      // Réception des données envoyées par le backend (initialData / newData)
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("Message WebSocket reçu:", msg);

          if (msg.type === "initialData") {
            console.log("Données initiales reçues.");
            resolved = true;

            const formatted = convertirDonneesBackend(msg.data);
            resolve(formatted);
          }

          // Possibilité d'ajouter une gestion du "newData" plus tard
        } catch (err) {
          console.error("Erreur lors du traitement du message WebSocket:", err);
        }
      };

      // Gestion des erreurs WebSocket
      ws.onerror = (err) => {
        console.error("Erreur WebSocket:", err);
        if (!resolved) reject(err);
      };

      // Si la connexion se ferme avant de recevoir la première réponse
      ws.onclose = () => {
        console.warn("WebSocket fermé.");
        if (!resolved) reject("Connexion WebSocket fermée trop tôt.");
      };

      // Timeout de sécurité (10 secondes)
      setTimeout(() => {
        if (!resolved) {
          console.error("Timeout WebSocket: aucune donnée reçue.");
          reject("Timeout WebSocket");
        }
      }, 10000);

    } catch (err) {
      console.error("Erreur lors de l'initialisation de la WebSocket:", err);
      reject(err);
    }
  });
}

/**
 * Convertit le format des données envoyées par le backend
 * vers le format attendu par Dashboard.jsx.
 */
function convertirDonneesBackend(aggregationList) {
  if (!aggregationList || aggregationList.length === 0) {
    console.warn("Aucune donnée d'agrégation reçue.");
    return {};
  }

  // On prend la dernière période d'agrégation (la plus récente)
  const agg = aggregationList[aggregationList.length - 1];

  const {
    runsInfo,
    statusInfo,
    timeInfo
  } = agg;

  return {
    repo: runsInfo.repositoryName,
    workflows: runsInfo.workflowNames ?? [],
    branches: runsInfo.branches ?? [],
    actors: runsInfo.authors ?? [],

    totalRuns: statusInfo.numRuns ?? 0,
    successRate: statusInfo.successes / (statusInfo.numRuns || 1),
    failureRate: statusInfo.failures / (statusInfo.numRuns || 1),

    medianDuration: timeInfo.median ?? 0,
    avgDuration: timeInfo.average ?? 0,
    stdDeviation: 35, // valeur par défaut pour compatibilité

    // Pour l'instant, ces champs peuvent être ajoutés plus tard ou remplis selon vos besoins
    runsOverTime: [],
    statusBreakdown: [
      { name: "success", value: statusInfo.successes },
      { name: "failure", value: statusInfo.failures },
      { name: "cancelled", value: statusInfo.cancelled }
    ],
    branchComparison: []
  };
}
