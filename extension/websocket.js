const WS_CONFIG = {
  baseUrl: 'ws://localhost:3000/data',
  reconnectDelay: 3000,
  maxReconnectAttempts: 3
};

/**
 * Classe pour gérer la connexion WebSocket avec le backend
 */
class GHAWebSocketClient {
  constructor(repo, options = {}) {
    this.repo = repo;
    this.options = {
      aggregationPeriod: options.aggregationPeriod || 'month',
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      author: options.author || null,
      branch: options.branch || null,
      workflowName: options.workflowName || null
    };
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.listeners = {
      initialData: [],
      newData: [],
      complete: [],
      error: [],
      progress: []
    };
  }

  /**
   * Construit l'URL WebSocket avec les paramètres
   */
    buildWebSocketURL() {
      const encodedRepo = encodeURIComponent(this.repo);
      let url = `${WS_CONFIG.baseUrl}/${encodedRepo}`;
    
      const params = [];
    
      if (this.options.aggregationPeriod) {
        params.push(`aggregationPeriod=${encodeURIComponent(this.options.aggregationPeriod)}`);
      }
      if (this.options.startDate) {
        const startDateOnly = this.options.startDate.split('T')[0];
        params.push(`startDate=${encodeURIComponent(startDateOnly)}`);
      }
      if (this.options.endDate) {
        const endDateOnly = this.options.endDate.split('T')[0];
        params.push(`endDate=${encodeURIComponent(endDateOnly)}`);
      }
      if (this.options.author) {
        params.push(`author=${encodeURIComponent(this.options.author)}`);
      }
      if (this.options.branch) {
        params.push(`branch=${encodeURIComponent(this.options.branch)}`);
      }
      if (this.options.workflowName) {
        params.push(`workflowName=${encodeURIComponent(this.options.workflowName)}`);
      }
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      return url;
    }

  /**
   * Démarre la connexion WebSocket
   */
  connect() {
    return new Promise((resolve, reject) => {
      const url = this.buildWebSocketURL();
      console.log(`🔌 Connecting to WebSocket: ${url}`);
      
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };
        
        this.ws.onclose = (event) => {
          console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`);
          
          if (event.code === 1000) {
            // Normal closure - extraction terminée
            console.log('✅ Extraction completed');
            this.emit('complete');
          } else {
            // Erreur ou fermeture anormale
            this.handleReconnect();
          }
        };
        
      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Gère les messages reçus du serveur
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log('📨 WebSocket message:', message);
      
      switch (message.type) {
        case 'initialData':
          this.emit('initialData', message.data);
          break;
          
        case 'newData':
          this.emit('newData', message.data);
          this.emit('progress', {
            message: 'Receiving new data...',
            data: message.data
          });
          break;
          
        default:
          console.warn('⚠️ Unknown message type:', message.type);
      }
      
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
      this.emit('error', error);
    }
  }

  /**
   * Gère la reconnexion automatique
   */
  handleReconnect() {
    if (this.reconnectAttempts < WS_CONFIG.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting (attempt ${this.reconnectAttempts}/${WS_CONFIG.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('❌ Reconnection failed:', error);
        });
      }, WS_CONFIG.reconnectDelay);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts reached'));
    }
  }

  /**
   * Enregistre un listener pour un événement
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Émet un événement à tous les listeners
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Ferme la connexion WebSocket
   */
  close() {
    if (this.ws) {
      console.log('🔌 Closing WebSocket connection');
      this.ws.close(1000, 'Client closed connection');
      this.ws = null;
    }
  }
}

/**
 * Fonction helper pour extraire des données via WebSocket
 * Retourne une Promise qui se résout avec toutes les données agrégées
 */
export async function extractDataViaWebSocket(repo, options = {}) {
  return new Promise((resolve, reject) => {
    const client = new GHAWebSocketClient(repo, options);
    const allData = [];
    
    client.on('initialData', (data) => {
      console.log(`📊 Received initial data: ${data.length} items`);
      allData.push(...data);
    });
    
    client.on('newData', (data) => {
      console.log('📊 Received new data item');
      allData.push(data);
    });
    
    client.on('complete', () => {
      console.log(`✅ Extraction complete! Total items: ${allData.length}`);
      resolve(allData);
    });
    
    client.on('error', (error) => {
      console.error('❌ WebSocket extraction error:', error);
      reject(error);
    });
    
    // Démarrer la connexion
    client.connect().catch(reject);
  });
}

/**
 * Fonction pour extraire et formater les données pour le dashboard
 */
export async function fetchDashboardDataViaWebSocket(repo, filters = {}) {
  try {
    console.log(`🚀 Starting WebSocket extraction for ${repo}`);
    
    const options = {
      aggregationPeriod: 'day',
      startDate: filters.start || null,
      endDate: filters.end || null,
      branch: filters.branch && !filters.branch.includes('all') ? filters.branch[0] : null,
      author: filters.actor && !filters.actor.includes('all') ? filters.actor[0] : null,
      workflowName: filters.workflow && !filters.workflow.includes('all') ? filters.workflow[0] : null
    };
    
    const rawData = await extractDataViaWebSocket(repo, options);
    
    // Convertir les données agrégées au format attendu par le dashboard
    const dashboardData = convertWebSocketDataToDashboard(rawData, repo);
    
    console.log('✅ Dashboard data ready from WebSocket:', dashboardData);
    return dashboardData;
    
  } catch (error) {
    console.error('❌ WebSocket extraction failed:', error);
    throw error;
  }
}

/**
 * Convertit les données WebSocket au format Dashboard
 */
function convertWebSocketDataToDashboard(aggregatedData, repo) {
  if (!aggregatedData || aggregatedData.length === 0) {
    return {
      repo: `${repo} (No data)`,
      totalRuns: 0,
      successRate: 0,
      failureRate: 0,
      avgDuration: 0,
      medianDuration: 0,
      stdDeviation: 0,
      runsOverTime: [],
      statusBreakdown: [],
      topWorkflows: [],
      durationBox: [],
      failureRateOverTime: [],
      branchComparison: [],
      spikes: [],
      workflows: ['all'],
      branches: ['all'],
      actors: ['all']
    };
  }
  
  // Calculer les métriques globales
  const totalRuns = aggregatedData.reduce((sum, item) => sum + item.statusInfo.numRuns, 0);
  const totalSuccesses = aggregatedData.reduce((sum, item) => sum + item.statusInfo.successes, 0);
  const totalFailures = aggregatedData.reduce((sum, item) => sum + item.statusInfo.failures, 0);
  const totalCancelled = aggregatedData.reduce((sum, item) => sum + item.statusInfo.cancelled, 0);
  
  const successRate = totalRuns > 0 ? totalSuccesses / totalRuns : 0;
  const failureRate = totalRuns > 0 ? totalFailures / totalRuns : 0;
  
  // Calculer la durée moyenne
  const avgDuration = aggregatedData.length > 0 
    ? aggregatedData.reduce((sum, item) => sum + item.timeInfo.average, 0) / aggregatedData.length
    : 0;
  
  const medianDuration = aggregatedData.length > 0
    ? aggregatedData.reduce((sum, item) => sum + item.timeInfo.median, 0) / aggregatedData.length
    : 0;
  
  // Construire runsOverTime
  const runsOverTime = aggregatedData.map(item => ({
    date: item.periodStart,
    runs: item.statusInfo.numRuns,
    successes: item.statusInfo.successes,
    failures: item.statusInfo.failures,
    avgDuration: Math.round(item.timeInfo.average),
    medianDuration: Math.round(item.timeInfo.median),
    minDuration: Math.round(item.timeInfo.min),
    maxDuration: Math.round(item.timeInfo.max)
  }));
  
  // Status breakdown
  const statusBreakdown = [
    { name: 'success', value: totalSuccesses },
    { name: 'failure', value: totalFailures },
    { name: 'cancelled', value: totalCancelled }
  ];
  
  // Extraire les workflows uniques
  const workflowsSet = new Set();
  const branchesSet = new Set();
  const actorsSet = new Set();
  
  aggregatedData.forEach(item => {
    if (item.runsInfo) {
      item.runsInfo.workflowNames?.forEach(w => workflowsSet.add(w));
      item.runsInfo.branches?.forEach(b => branchesSet.add(b));
      item.runsInfo.authors?.forEach(a => actorsSet.add(a));
    }
  });
  
  const workflows = ['all', ...Array.from(workflowsSet)];
  const branches = ['all', ...Array.from(branchesSet)];
  const actors = ['all', ...Array.from(actorsSet)];
  
  // Générer topWorkflows (estimation)
  const topWorkflows = Array.from(workflowsSet).slice(0, 5).map(name => ({
    name,
    runs: Math.floor(totalRuns / workflowsSet.size),
    success: Math.floor(totalSuccesses / workflowsSet.size),
    avgDuration: Math.round(avgDuration),
    medianDuration: Math.round(medianDuration)
  }));
  
  // Duration box
  const durationBox = topWorkflows.map(w => ({
    name: w.name,
    min: Math.round(medianDuration * 0.6),
    q1: Math.round(medianDuration * 0.8),
    median: Math.round(medianDuration),
    q3: Math.round(medianDuration * 1.2),
    max: Math.round(medianDuration * 1.5)
  }));
  
  // Failure rate over time
  const failureRateOverTime = runsOverTime.map(item => ({
    date: item.date,
    failureRate: item.runs > 0 ? (item.failures / item.runs) * 100 : 0,
    avgFailureRate: failureRate * 100,
    totalRuns: item.runs
  }));
  
  // Branch comparison (mock pour l'instant)
  const branchComparison = Array.from(branchesSet).slice(0, 5).map((branch, idx) => ({
    branch,
    workflow: Array.from(workflowsSet)[idx % workflowsSet.size] || 'CI',
    totalRuns: Math.floor(totalRuns / branchesSet.size),
    successRate: Math.round(successRate * 100),
    avgDuration: Math.round(avgDuration),
    medianDuration: Math.round(medianDuration),
    failures: Math.floor(totalFailures / branchesSet.size)
  }));
  
  // Spike detection
  const spikes = runsOverTime.map(item => ({
    ...item,
    anomalyScore: null,
    isAnomaly: false,
    anomalyType: null,
    anomalyDetail: null
  }));
  
  return {
    repo,
    totalRuns,
    successRate,
    failureRate,
    avgDuration: Math.round(avgDuration),
    medianDuration: Math.round(medianDuration),
    stdDeviation: 35, // TODO: calculer depuis les données
    runsOverTime,
    statusBreakdown,
    topWorkflows,
    durationBox,
    failureRateOverTime,
    branchComparison,
    spikes,
    workflows,
    branches,
    actors
  };
}

export { GHAWebSocketClient };