/**
 * Extrait le nom du repository depuis une URL GitHub
 * @param {string} url - URL de la page GitHub
 * @returns {string|null} - Format "owner/repo" ou null
 */
export function extractRepoFromUrl(url) {
  if (!url || !url.includes('github.com')) {
    return null;
  }
  
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    // URL format: github.com/:owner/:repo/...
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];
      return `${owner}/${repo}`;
    }
  } catch (error) {
    console.error('Error parsing GitHub URL:', error);
  }
  
  return null;
}

/**
 * Sauvegarde le repository actuel dans chrome.storage
 */
export function saveCurrentRepo(repo) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ currentRepo: repo }, () => {
      console.log(`✅ Saved current repo: ${repo}`);
      resolve();
    });
  });
}

/**
 * Récupère le repository sauvegardé
 */
export function getCurrentRepo() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['currentRepo'], (result) => {
      if (result.currentRepo) {
        resolve(result.currentRepo);
      } else {
        reject(new Error('No repository in storage'));
      }
    });
  });
}

/**
 * Détecte et sauvegarde automatiquement le repo de l'onglet actif
 */
export async function detectAndSaveRepo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      throw new Error('No active tab');
    }
    
    const repo = extractRepoFromUrl(tab.url);
    
    if (repo) {
      await saveCurrentRepo(repo);
      return repo;
    } else {
      throw new Error('Not a GitHub repository page');
    }
  } catch (error) {
    console.error('Error detecting repo:', error);
    throw error;
  }
}